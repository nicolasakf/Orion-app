"""Backend runtime for Orion UI DataFrame table outputs."""

from __future__ import annotations

import csv
import io
import math
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

JsonValue = Any

TABLE_COMM_TARGET = "orion.ui.table"
MAX_PAGE_SIZE = 500
MAX_EXPORT_ROWS = 100_000
MAX_CATEGORY_FILTER_OPTIONS = 200
FILTER_OPERATIONS = {
    "contains",
    "doesNotContain",
    "startsWith",
    "endsWith",
    "equals",
    "notEquals",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
    "between",
    "in",
    "notIn",
    "onDate",
    "blank",
    "notBlank",
    "regex",
}

TEXT_FILTER_OPERATIONS = [
    "contains",
    "doesNotContain",
    "startsWith",
    "endsWith",
    "equals",
    "notEquals",
    "regex",
    "blank",
    "notBlank",
]
EQUALITY_FILTER_OPERATIONS = ["equals", "notEquals", "blank", "notBlank"]
ORDERED_FILTER_OPERATIONS = [
    "equals",
    "notEquals",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
    "between",
    "blank",
    "notBlank",
]
DATETIME_FILTER_OPERATIONS = [
    "equals",
    "notEquals",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
    "between",
    "onDate",
    "blank",
    "notBlank",
]

_TABLES: Dict[str, "TableRegistration"] = {}
_COMM_TARGET_REGISTERED = False


@dataclass
class TableRegistration:
    """Process-local registration for one rendered DataFrame table."""

    table_id: str
    dataframe: Any
    source: str
    show_index: bool
    max_cell_chars: int
    column_descriptions: Dict[str, str]


def _import_pandas() -> Any:
    """Import pandas lazily so regular orion_ui usage has no hard dependency."""
    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise TypeError("ui.table requires pandas to be installed in the active kernel.") from exc
    return pd


def _is_dataframe(value: Any) -> bool:
    """Return true when value is a pandas DataFrame."""
    pd = _import_pandas()
    return isinstance(value, pd.DataFrame)


def _json_scalar(value: Any, max_chars: int) -> JsonValue:
    """Convert a pandas/numpy scalar to a JSON-compatible table cell value."""
    pd = _import_pandas()
    try:
        import numpy as np  # type: ignore
    except ImportError:  # pragma: no cover - pandas normally depends on numpy.
        np = None

    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, bool):
        return value
    if np is not None and isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, int):
        return value
    if np is not None and isinstance(value, np.integer):
        return int(value)
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        return "inf" if value > 0 else "-inf"
    if np is not None and isinstance(value, np.floating):
        numeric = float(value)
        if math.isfinite(numeric):
            return numeric
        return "inf" if numeric > 0 else "-inf"
    if isinstance(value, (datetime, date)):
        return value.isoformat()

    text = str(value)
    return text[:max_chars] + "..." if len(text) > max_chars else text


def _arrow_dtype_name(dtype: Any) -> str:
    """Return the logical PyArrow dtype name for a pandas ArrowDtype."""
    arrow_dtype = getattr(dtype, "pyarrow_dtype", None)
    return str(arrow_dtype).lower() if arrow_dtype is not None else ""


def _filter_descriptor(series: Any) -> Dict[str, JsonValue]:
    """Classify a Series into one semantic filter family."""
    pd = _import_pandas()
    dtype = series.dtype
    effective_dtype = getattr(dtype, "subtype", dtype)
    arrow_name = _arrow_dtype_name(effective_dtype) or _arrow_dtype_name(dtype)

    if isinstance(dtype, pd.CategoricalDtype):
        category_values = [
            _json_scalar(value, 500)
            for value in series.cat.categories
        ]
        options_are_bounded = len(category_values) <= MAX_CATEGORY_FILTER_OPTIONS
        operations = ["equals", "notEquals"]
        if options_are_bounded:
            operations.extend(["in", "notIn"])
        if bool(dtype.ordered):
            operations.extend(
                [
                    "greaterThan",
                    "greaterThanOrEqual",
                    "lessThan",
                    "lessThanOrEqual",
                    "between",
                ]
            )
        operations.extend(["blank", "notBlank"])
        descriptor: Dict[str, JsonValue] = {
            "filterKind": "categorical",
            "filterOperations": operations,
            "ordered": bool(dtype.ordered),
        }
        if options_are_bounded:
            descriptor["filterOptions"] = category_values
        return descriptor

    if pd.api.types.is_bool_dtype(effective_dtype) or arrow_name == "bool":
        return {
            "filterKind": "boolean",
            "filterOperations": EQUALITY_FILTER_OPERATIONS,
        }

    if (
        pd.api.types.is_datetime64_any_dtype(effective_dtype)
        or arrow_name.startswith("timestamp")
    ):
        timezone = getattr(dtype, "tz", None)
        if timezone is None:
            timezone = getattr(getattr(dtype, "pyarrow_dtype", None), "tz", None)
        descriptor = {
            "filterKind": "datetime",
            "filterOperations": DATETIME_FILTER_OPERATIONS,
        }
        if timezone is not None:
            descriptor["timezone"] = str(timezone)
        return descriptor

    if pd.api.types.is_timedelta64_dtype(effective_dtype) or arrow_name.startswith(
        "duration"
    ):
        return {
            "filterKind": "timedelta",
            "filterOperations": ORDERED_FILTER_OPERATIONS,
        }

    if isinstance(dtype, pd.PeriodDtype):
        frequency = getattr(dtype, "freq", None)
        return {
            "filterKind": "period",
            "filterOperations": ORDERED_FILTER_OPERATIONS,
            "frequency": getattr(
                dtype,
                "_freqstr",
                getattr(frequency, "freqstr", str(frequency)),
            ),
        }

    if isinstance(dtype, pd.IntervalDtype):
        return {
            "filterKind": "interval",
            "filterOperations": EQUALITY_FILTER_OPERATIONS,
        }

    if pd.api.types.is_complex_dtype(effective_dtype):
        return {
            "filterKind": "complex",
            "filterOperations": EQUALITY_FILTER_OPERATIONS,
        }

    if arrow_name.startswith(("date32", "date64")):
        return {
            "filterKind": "date",
            "filterOperations": ORDERED_FILTER_OPERATIONS,
        }

    if arrow_name.startswith(("binary", "large_binary", "fixed_size_binary")):
        return {
            "filterKind": "binary",
            "filterOperations": EQUALITY_FILTER_OPERATIONS,
        }

    arrow_is_numeric = arrow_name.startswith(
        (
            "int",
            "uint",
            "float",
            "double",
            "decimal",
        )
    )
    if pd.api.types.is_numeric_dtype(effective_dtype) or arrow_is_numeric:
        numeric_type = (
            "integer"
            if pd.api.types.is_integer_dtype(effective_dtype)
            or arrow_name.startswith(("int", "uint"))
            else "decimal"
            if arrow_name.startswith("decimal")
            else "float"
        )
        return {
            "filterKind": "number",
            "filterOperations": ORDERED_FILTER_OPERATIONS,
            "numericType": numeric_type,
        }

    if pd.api.types.is_object_dtype(effective_dtype):
        non_null = series.dropna()
        if non_null.empty:
            return {
                "filterKind": "empty",
                "filterOperations": ["blank", "notBlank"],
            }
        inferred = pd.api.types.infer_dtype(non_null, skipna=True)
        if inferred in {"string", "unicode"}:
            return {
                "filterKind": "text",
                "filterOperations": TEXT_FILTER_OPERATIONS,
            }
        if inferred == "boolean":
            return {
                "filterKind": "boolean",
                "filterOperations": EQUALITY_FILTER_OPERATIONS,
            }
        if inferred in {"integer", "floating", "mixed-integer-float", "decimal"}:
            return {
                "filterKind": "number",
                "filterOperations": ORDERED_FILTER_OPERATIONS,
                "numericType": (
                    "decimal"
                    if inferred == "decimal"
                    else "integer"
                    if inferred == "integer"
                    else "float"
                ),
            }
        if inferred == "date":
            return {
                "filterKind": "date",
                "filterOperations": ORDERED_FILTER_OPERATIONS,
            }
        if inferred in {"datetime", "datetime64"}:
            timezone = getattr(non_null.iloc[0], "tzinfo", None)
            descriptor = {
                "filterKind": "datetime",
                "filterOperations": DATETIME_FILTER_OPERATIONS,
            }
            if timezone is not None:
                descriptor["timezone"] = str(timezone)
            return descriptor
        if inferred in {"timedelta", "timedelta64"}:
            return {
                "filterKind": "timedelta",
                "filterOperations": ORDERED_FILTER_OPERATIONS,
            }
        if inferred == "complex":
            return {
                "filterKind": "complex",
                "filterOperations": EQUALITY_FILTER_OPERATIONS,
            }
        if inferred == "bytes":
            return {
                "filterKind": "binary",
                "filterOperations": EQUALITY_FILTER_OPERATIONS,
            }
        return {
            "filterKind": "fallback",
            "filterOperations": TEXT_FILTER_OPERATIONS,
        }

    if pd.api.types.is_string_dtype(effective_dtype) or arrow_name in {
        "string",
        "large_string",
    }:
        return {
            "filterKind": "text",
            "filterOperations": TEXT_FILTER_OPERATIONS,
        }

    return {
        "filterKind": "fallback",
        "filterOperations": TEXT_FILTER_OPERATIONS,
    }


def _normalize_column_descriptions(
    column_descriptions: Optional[Mapping[str, str]],
) -> Dict[str, str]:
    """Return validated column descriptions keyed by serialized column name."""
    if column_descriptions is None:
        return {}
    if not isinstance(column_descriptions, Mapping):
        raise TypeError("ui.table column_descriptions must be a mapping of column names to strings.")

    normalized: Dict[str, str] = {}
    for column, description in column_descriptions.items():
        if not isinstance(description, str):
            raise TypeError("ui.table column_descriptions values must be strings.")
        if description:
            normalized[str(column)] = description
    return normalized


def _serialized_column_lookup(dataframe: Any) -> Dict[str, Any]:
    """Map unique frontend column keys back to their DataFrame labels."""
    lookup: Dict[str, Any] = {}
    ambiguous = set()
    for dataframe_column in dataframe.columns:
        serialized = str(dataframe_column)
        if serialized in lookup:
            ambiguous.add(serialized)
            continue
        lookup[serialized] = dataframe_column
    for serialized in ambiguous:
        lookup.pop(serialized, None)
    return lookup


def _require_serialized_column(dataframe: Any, column: str, setting: str) -> None:
    """Require a default-operation key to identify exactly one DataFrame column."""
    lookup = _serialized_column_lookup(dataframe)
    if column in lookup:
        return
    if any(str(dataframe_column) == column for dataframe_column in dataframe.columns):
        raise ValueError(
            f"ui.table {setting} column {column!r} is ambiguous after string conversion."
        )
    raise ValueError(f"ui.table {setting} column must match a DataFrame column.")


def _normalize_filter_value(operation: str, value: Any) -> JsonValue:
    """Normalize one filter value without losing range or set structure."""
    if operation == "between":
        if not isinstance(value, Mapping):
            raise ValueError("Between filters require lower and upper values.")
        lower = value.get("lower")
        upper = value.get("upper")
        if lower is None or upper is None or str(lower) == "" or str(upper) == "":
            raise ValueError("Between filters require non-empty lower and upper values.")
        return {"lower": str(lower), "upper": str(upper)}
    if operation in {"in", "notIn"}:
        if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
            raise ValueError("Set filters require a list of values.")
        normalized = [str(item) for item in value if item is not None and str(item) != ""]
        if not normalized:
            raise ValueError("Set filters require at least one value.")
        return normalized
    if operation in {"blank", "notBlank"}:
        return ""
    if isinstance(value, (Mapping, Sequence)) and not isinstance(value, (str, bytes)):
        raise ValueError(f"{operation} filters require one scalar value.")
    normalized_value = "" if value is None else str(value)
    if normalized_value == "":
        raise ValueError(f"{operation} filters require a non-empty value.")
    if operation == "regex":
        try:
            re.compile(normalized_value)
        except re.error as exc:
            raise ValueError(f"Invalid regular expression: {exc}.") from exc
    return normalized_value


def _normalized_filter_config(
    series: Any,
    column: str,
    operation: str,
    value: Any,
) -> Dict[str, JsonValue]:
    """Validate an operation against a Series and normalize its value."""
    descriptor = _filter_descriptor(series)
    allowed_operations = descriptor["filterOperations"]
    if operation not in allowed_operations:
        raise ValueError(
            f"Filter operation {operation!r} is unsupported for column "
            f"{column!r} with dtype {series.dtype!s}."
        )
    return {
        "column": column,
        "operation": operation,
        "value": _normalize_filter_value(operation, value),
    }


def _normalize_default_filters(
    dataframe: Any,
    default_filters: Optional[Sequence[Mapping[str, Any]]],
) -> List[Dict[str, JsonValue]]:
    """Validate default filters against the table's serialized columns."""
    if default_filters is None:
        return []
    if not isinstance(default_filters, Sequence) or isinstance(
        default_filters, (str, bytes)
    ):
        raise TypeError("ui.table default_filters must be a sequence of filter mappings.")

    normalized: List[Dict[str, JsonValue]] = []
    filtered_columns = set()
    column_lookup = _serialized_column_lookup(dataframe)
    for filter_config in default_filters:
        if not isinstance(filter_config, Mapping):
            raise TypeError("ui.table default_filters entries must be filter mappings.")
        column = filter_config.get("column")
        operation = filter_config.get("operation")
        if not isinstance(column, str):
            raise ValueError("ui.table default_filters columns must match DataFrame columns.")
        _require_serialized_column(dataframe, column, "default_filters")
        if column in filtered_columns:
            raise ValueError("ui.table default_filters may include only one filter per column.")
        if not isinstance(operation, str) or operation not in FILTER_OPERATIONS:
            raise ValueError("ui.table default_filters include an unsupported operation.")
        value = filter_config.get("value", "")
        normalized.append(
            _normalized_filter_config(
                dataframe[column_lookup[column]],
                column,
                operation,
                value,
            )
        )
        filtered_columns.add(column)
    return normalized


def _normalize_default_sort(
    dataframe: Any,
    default_sort: Optional[Mapping[str, str]],
) -> Optional[Dict[str, str]]:
    """Validate the optional default sort against the table's serialized columns."""
    if default_sort is None:
        return None
    if not isinstance(default_sort, Mapping):
        raise TypeError("ui.table default_sort must be a mapping with column and direction.")

    column = default_sort.get("column")
    direction = default_sort.get("direction")
    if not isinstance(column, str):
        raise ValueError("ui.table default_sort column must match a DataFrame column.")
    _require_serialized_column(dataframe, column, "default_sort")
    if direction not in {"asc", "desc"}:
        raise ValueError("ui.table default_sort direction must be 'asc' or 'desc'.")
    return {"column": column, "direction": direction}


def default_table_state(
    dataframe: Any,
    *,
    default_filters: Optional[Sequence[Mapping[str, Any]]] = None,
    default_sort: Optional[Mapping[str, str]] = None,
) -> Dict[str, JsonValue]:
    """Build the initial frontend operation state from table default arguments."""
    return {
        "search": "",
        "sort": _normalize_default_sort(dataframe, default_sort),
        "filters": _normalize_default_filters(dataframe, default_filters),
        "groupBy": None,
    }


def _column_metadata(
    df: Any,
    column_descriptions: Optional[Mapping[str, str]] = None,
) -> List[Dict[str, JsonValue]]:
    """Return lightweight column descriptors for a DataFrame."""
    descriptions = column_descriptions or {}
    columns: List[Dict[str, JsonValue]] = []
    for column in df.columns:
        series = df[column]
        key = str(column)
        metadata: Dict[str, JsonValue] = {
            "key": key,
            "label": key,
            "dtype": str(series.dtype),
            "nullCount": int(series.isna().sum()),
            **_filter_descriptor(series),
        }
        if key in descriptions:
            metadata["description"] = descriptions[key]
        columns.append(
            metadata
        )
    return columns


def _state_sort(state: Mapping[str, Any]) -> Optional[Dict[str, str]]:
    """Extract a valid sort config from a frontend table state."""
    sort = state.get("sort")
    if not isinstance(sort, Mapping):
        return None
    column = sort.get("column")
    direction = sort.get("direction")
    if isinstance(column, str) and direction in {"asc", "desc"}:
        return {"column": column, "direction": direction}
    return None


def _state_filters(state: Mapping[str, Any]) -> List[Dict[str, JsonValue]]:
    """Extract structured filters from a frontend table state."""
    filters = state.get("filters")
    if not isinstance(filters, Sequence) or isinstance(filters, (str, bytes)):
        return []

    result: List[Dict[str, JsonValue]] = []
    for entry in filters:
        if not isinstance(entry, Mapping):
            continue
        column = entry.get("column")
        operation = entry.get("operation")
        value = entry.get("value", "")
        if isinstance(column, str) and isinstance(operation, str):
            result.append(
                {
                    "column": column,
                    "operation": operation,
                    "value": value,
                }
            )
    return result


def _state_search(state: Mapping[str, Any]) -> str:
    """Extract the global search term from a frontend table state."""
    search = state.get("search")
    return search if isinstance(search, str) else ""


def _state_group_by(state: Mapping[str, Any]) -> Optional[str]:
    """Extract group-by column from a frontend table state."""
    group_by = state.get("groupBy")
    return group_by if isinstance(group_by, str) and group_by else None


def _parse_boolean(value: str) -> bool:
    """Parse a boolean filter value."""
    normalized = value.strip().lower()
    if normalized == "true":
        return True
    if normalized == "false":
        return False
    raise ValueError("Boolean filters require true or false.")


def _parse_number(value: str, numeric_type: str) -> Any:
    """Parse a numeric filter value without losing integer or decimal precision."""
    try:
        if numeric_type == "decimal":
            return Decimal(value)
        if numeric_type == "integer":
            parsed = Decimal(value)
            if parsed != parsed.to_integral_value():
                raise ValueError
            return int(parsed)
        return float(value)
    except (InvalidOperation, OverflowError, ValueError) as exc:
        raise ValueError(f"Invalid {numeric_type} filter value: {value!r}.") from exc


def _parse_datetime_value(value: str, timezone: Optional[str]) -> Any:
    """Parse a timestamp and align it with a column timezone."""
    pd = _import_pandas()
    try:
        parsed = pd.Timestamp(value)
        if timezone:
            if parsed.tzinfo is None:
                return parsed.tz_localize(timezone)
            return parsed.tz_convert(timezone)
        if parsed.tzinfo is not None:
            raise ValueError("Timezone-aware input cannot filter a timezone-naive column.")
        return parsed
    except Exception as exc:
        if isinstance(exc, ValueError) and "timezone-naive" in str(exc):
            raise
        raise ValueError(f"Invalid datetime filter value: {value!r}.") from exc


def _parse_date_value(value: str) -> date:
    """Parse an ISO date filter value."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Invalid date filter value: {value!r}.") from exc


def _category_value(series: Any, value: str) -> Any:
    """Resolve a serialized category value back to its typed category."""
    for category in series.cat.categories:
        if str(_json_scalar(category, 500)) == value:
            return category
    raise ValueError(f"Unknown category filter value: {value!r}.")


def _typed_filter_value(
    series: Any,
    descriptor: Mapping[str, Any],
    value: str,
) -> Any:
    """Parse one scalar filter value for a semantic column kind."""
    pd = _import_pandas()
    kind = descriptor["filterKind"]
    if kind == "boolean":
        return _parse_boolean(value)
    if kind == "number":
        return _parse_number(value, str(descriptor.get("numericType", "float")))
    if kind == "date":
        return _parse_date_value(value)
    if kind == "datetime":
        return _parse_datetime_value(value, descriptor.get("timezone"))
    if kind == "timedelta":
        try:
            return pd.to_timedelta(value)
        except Exception as exc:
            raise ValueError(f"Invalid duration filter value: {value!r}.") from exc
    if kind == "period":
        try:
            return pd.Period(value, freq=descriptor.get("frequency"))
        except Exception as exc:
            raise ValueError(f"Invalid period filter value: {value!r}.") from exc
    if kind == "categorical":
        return _category_value(series, value)
    if kind == "complex":
        try:
            return complex(value)
        except ValueError as exc:
            raise ValueError(f"Invalid complex filter value: {value!r}.") from exc
    return value


def _ordered_mask(series: Any, operation: str, parsed_value: Any) -> Any:
    """Apply one ordered comparison to a Series."""
    if operation == "equals":
        return series == parsed_value
    if operation == "notEquals":
        return series != parsed_value
    if operation == "greaterThan":
        return series > parsed_value
    if operation == "greaterThanOrEqual":
        return series >= parsed_value
    if operation == "lessThan":
        return series < parsed_value
    if operation == "lessThanOrEqual":
        return series <= parsed_value
    raise ValueError(f"Unsupported ordered filter operation: {operation!r}.")


def _filter_mask(
    series: Any,
    operation: str,
    value: JsonValue,
    descriptor: Optional[Mapping[str, Any]] = None,
) -> Any:
    """Build a typed pandas boolean mask for one structured filter."""
    pd = _import_pandas()
    resolved_descriptor = descriptor or _filter_descriptor(series)
    kind = resolved_descriptor["filterKind"]
    text = series.astype("string")
    lower_text = text.str.lower()
    non_null = series.notna()

    if operation == "blank":
        if kind in {"text", "fallback"}:
            return series.isna() | (text.fillna("").str.len() == 0)
        return series.isna()
    if operation == "notBlank":
        if kind in {"text", "fallback"}:
            return ~(series.isna() | (text.fillna("").str.len() == 0))
        return series.notna()

    if not isinstance(value, (str, list, dict)):
        raise ValueError(f"Invalid filter value for {operation!r}.")

    if kind in {"text", "fallback"}:
        if not isinstance(value, str):
            raise ValueError(f"{operation} filters require one text value.")
        lower_value = value.lower()
        if operation == "contains":
            return non_null & lower_text.str.contains(re.escape(lower_value), na=False)
        if operation == "doesNotContain":
            return non_null & ~lower_text.str.contains(re.escape(lower_value), na=False)
        if operation == "startsWith":
            return non_null & lower_text.str.startswith(lower_value, na=False)
        if operation == "endsWith":
            return non_null & lower_text.str.endswith(lower_value, na=False)
        if operation == "equals":
            return non_null & (lower_text == lower_value)
        if operation == "notEquals":
            return non_null & (lower_text != lower_value)
        if operation != "regex":
            raise ValueError(f"Unsupported text filter operation: {operation!r}.")
        try:
            re.compile(value)
        except re.error as exc:
            raise ValueError(f"Invalid regular expression: {exc}.") from exc
        return non_null & text.str.contains(value, regex=True, na=False)

    if kind in {"binary", "interval"}:
        if not isinstance(value, str):
            raise ValueError(f"{operation} filters require one scalar value.")
        comparison = text == value
        if operation == "equals":
            return non_null & comparison
        if operation == "notEquals":
            return non_null & ~comparison
        raise ValueError(f"Unsupported {kind} filter operation: {operation!r}.")

    if operation in {"in", "notIn"}:
        if kind != "categorical" or not isinstance(value, list):
            raise ValueError(f"{operation} requires a categorical value list.")
        parsed_values = [_category_value(series, item) for item in value]
        membership = series.isin(parsed_values)
        return non_null & (membership if operation == "in" else ~membership)

    if operation == "onDate":
        if kind != "datetime" or not isinstance(value, str):
            raise ValueError("On date requires a datetime column and one ISO date.")
        day = _parse_date_value(value[:10])
        timezone = resolved_descriptor.get("timezone")
        start = pd.Timestamp(day)
        if timezone:
            start = start.tz_localize(timezone)
        end = start + pd.DateOffset(days=1)
        return non_null & (series >= start) & (series < end)

    if operation == "between":
        if not isinstance(value, dict):
            raise ValueError("Between filters require lower and upper values.")
        lower = _typed_filter_value(
            series,
            resolved_descriptor,
            str(value["lower"]),
        )
        upper = _typed_filter_value(
            series,
            resolved_descriptor,
            str(value["upper"]),
        )
        if lower > upper:
            raise ValueError("Between filter lower value must not exceed upper value.")
        return non_null & (series >= lower) & (series <= upper)

    if not isinstance(value, str):
        raise ValueError(f"{operation} filters require one scalar value.")
    parsed_value = _typed_filter_value(series, resolved_descriptor, value)
    return non_null & _ordered_mask(series, operation, parsed_value)


def _apply_operations(registration: TableRegistration, state: Mapping[str, Any]) -> Any:
    """Apply backend search/filter/sort/group operations to a DataFrame."""
    df = registration.dataframe
    column_lookup = _serialized_column_lookup(df)

    for filter_config in _state_filters(state):
        serialized_column = filter_config["column"]
        if serialized_column not in column_lookup:
            continue
        column = column_lookup[serialized_column]
        source_series = registration.dataframe[column]
        normalized_filter = _normalized_filter_config(
            source_series,
            serialized_column,
            str(filter_config["operation"]),
            filter_config.get("value", ""),
        )
        descriptor = _filter_descriptor(source_series)
        mask = _filter_mask(
            df[column],
            str(normalized_filter["operation"]),
            normalized_filter["value"],
            descriptor,
        )
        df = df.loc[mask]

    search = _state_search(state).strip()
    if search:
        lowered = search.lower()
        mask = None
        for column in df.columns:
            column_mask = df[column].astype("string").str.lower().str.contains(
                re.escape(lowered),
                na=False,
            )
            mask = column_mask if mask is None else (mask | column_mask)
        if mask is not None:
            df = df.loc[mask]

    sort = _state_sort(state)
    if sort and sort["column"] in column_lookup:
        sort_column = column_lookup[sort["column"]]
        df = df.sort_values(
            sort_column,
            ascending=sort["direction"] == "asc",
            kind="mergesort",
        )

    group_by = _state_group_by(state)
    if group_by and group_by in column_lookup:
        group_by_column = column_lookup[group_by]
        df = df.sort_values(group_by_column, kind="mergesort")

    return df


def _table_columns(registration: TableRegistration, df: Any) -> List[Dict[str, JsonValue]]:
    """Return visible table columns, including the index pseudo-column when enabled."""
    columns: List[Dict[str, JsonValue]] = []
    if registration.show_index:
        index_column: Dict[str, JsonValue] = {
            "key": "__index__",
            "label": "Index",
            "dtype": "index",
            "isIndex": True,
        }
        if "__index__" in registration.column_descriptions:
            index_column["description"] = registration.column_descriptions["__index__"]
        columns.append(index_column)
    columns.extend(_column_metadata(df, registration.column_descriptions))
    return columns


def _row_dicts(
    registration: TableRegistration,
    df: Any,
    offset: int,
    limit: int,
    group_by: Optional[str],
) -> Tuple[List[Dict[str, JsonValue]], Dict[str, int]]:
    """Serialize a bounded DataFrame slice into row dictionaries."""
    limit = max(1, min(int(limit), MAX_PAGE_SIZE))
    offset = max(0, int(offset))
    sliced = df.iloc[offset : offset + limit]
    group_counts: Dict[str, int] = {}
    column_lookup = _serialized_column_lookup(df)
    has_group_by_column = bool(group_by) and group_by in column_lookup
    group_by_column = column_lookup[group_by] if has_group_by_column else None
    if has_group_by_column:
        counts = df[group_by_column].value_counts(dropna=False)
        group_counts = {str(key): int(value) for key, value in counts.items()}

    rows: List[Dict[str, JsonValue]] = []
    for absolute_index, (index_value, row) in enumerate(sliced.iterrows(), start=offset):
        serialized: Dict[str, JsonValue] = {"__rowNumber": absolute_index}
        if registration.show_index:
            serialized["__index__"] = _json_scalar(index_value, registration.max_cell_chars)
        if has_group_by_column:
            group_value = _json_scalar(
                row[group_by_column],
                registration.max_cell_chars,
            )
            serialized["__orion_group_value"] = str(group_value)
        for column in df.columns:
            serialized[str(column)] = _json_scalar(row[column], registration.max_cell_chars)
        rows.append(serialized)

    return rows, group_counts


def get_table_window(
    table_id: str,
    state: Optional[Mapping[str, Any]] = None,
    offset: int = 0,
    limit: int = 50,
    *,
    action: str = "fetch",
) -> Dict[str, JsonValue]:
    """Return a bounded, operation-aware row window for a registered table."""
    registration = _require_table(table_id, action=action)
    table_state = state or {}
    df = _apply_operations(registration, table_state)
    group_by = _state_group_by(table_state)
    rows, group_counts = _row_dicts(registration, df, offset, limit, group_by)

    return {
        "tableId": table_id,
        "columns": _table_columns(registration, registration.dataframe),
        "rows": rows,
        "offset": max(0, int(offset)),
        "limit": max(1, min(int(limit), MAX_PAGE_SIZE)),
        "totalRows": int(len(df)),
        "sourceRows": int(len(registration.dataframe)),
        "totalColumns": int(len(registration.dataframe.columns)),
        "groupBy": group_by,
        "groupCounts": group_counts,
        "expression": state_expression(
            registration.source,
            table_state,
            registration.dataframe,
        ),
    }


def column_stats(
    table_id: str,
    column: str,
    state: Optional[Mapping[str, Any]] = None,
    *,
    action: str = "stats",
) -> Dict[str, JsonValue]:
    """Return backend-computed stats for one visible DataFrame column."""
    pd = _import_pandas()
    registration = _require_table(table_id, action=action)
    df = _apply_operations(registration, state or {})
    column_lookup = _serialized_column_lookup(df)
    if column not in column_lookup:
        raise KeyError(f"Column not found: {column}")
    dataframe_column = column_lookup[column]

    series = df[dataframe_column]
    numeric = pd.to_numeric(series, errors="coerce")
    numeric_count = int(numeric.notna().sum())
    top_values = series.value_counts(dropna=False).head(20)
    unique_values = [
        {"value": str(key), "count": int(value)}
        for key, value in top_values.items()
    ]

    return {
        "column": column,
        "count": int(len(series)),
        "numericCount": numeric_count,
        "sum": float(numeric.sum()) if numeric_count else None,
        "min": float(numeric.min()) if numeric_count else None,
        "max": float(numeric.max()) if numeric_count else None,
        "avg": float(numeric.mean()) if numeric_count else None,
        "uniqueValues": unique_values,
    }


def filter_value(
    table_id: str,
    column: str,
    row_number: int,
    state: Optional[Mapping[str, Any]] = None,
    *,
    action: str = "filter_value",
) -> Dict[str, str]:
    """Return one untruncated cell value for a keyboard-created filter."""
    registration = _require_table(table_id, action=action)
    df = _apply_operations(registration, state or {})
    column_lookup = _serialized_column_lookup(df)
    if column not in column_lookup:
        raise KeyError(f"Column not found: {column}")
    if row_number < 0 or row_number >= len(df):
        raise IndexError("Selected table row is no longer available.")

    value = df.iloc[row_number][column_lookup[column]]
    pd = _import_pandas()
    try:
        if pd.isna(value):
            return {"value": ""}
    except Exception:
        pass
    if isinstance(value, (datetime, date)):
        return {"value": value.isoformat()}
    return {"value": str(value)}


def export_csv(
    table_id: str,
    state: Optional[Mapping[str, Any]] = None,
    columns: Optional[Iterable[str]] = None,
    max_rows: int = MAX_EXPORT_ROWS,
    *,
    action: str = "export_csv",
) -> Dict[str, JsonValue]:
    """Return CSV text for the current backend table view with a row cap."""
    registration = _require_table(table_id, action=action)
    df = _apply_operations(registration, state or {})
    column_lookup = _serialized_column_lookup(df)
    selected_columns = [
        column_lookup[column]
        for column in columns or []
        if column in column_lookup
    ]
    if selected_columns:
        df = df.loc[:, selected_columns]

    truncated = len(df) > max_rows
    df = df.iloc[:max_rows]
    output = io.StringIO()
    df.to_csv(output, index=registration.show_index, quoting=csv.QUOTE_MINIMAL)
    return {
        "csv": output.getvalue(),
        "rowCount": int(len(df)),
        "truncated": truncated,
        "expression": state_expression(
            registration.source,
            state or {},
            registration.dataframe,
        ),
    }


def _quote_string(value: str) -> str:
    """Return a Python string literal for generated expression metadata."""
    return repr(value)


def _typed_value_expression(
    series: Any,
    descriptor: Mapping[str, Any],
    value: str,
) -> str:
    """Return executable Python syntax for one parsed filter value."""
    parsed = _typed_filter_value(series, descriptor, value)
    kind = descriptor["filterKind"]
    if kind == "number" and descriptor.get("numericType") == "decimal":
        return f"__import__('decimal').Decimal({_quote_string(value)})"
    if kind == "date":
        return f"__import__('datetime').date.fromisoformat({_quote_string(value)})"
    if kind == "datetime":
        expression = f"__import__('pandas').Timestamp({_quote_string(value)})"
        timezone = descriptor.get("timezone")
        if timezone:
            pd = _import_pandas()
            if pd.Timestamp(value).tzinfo is None:
                expression += f".tz_localize({_quote_string(str(timezone))})"
            else:
                expression += f".tz_convert({_quote_string(str(timezone))})"
        return expression
    if kind == "timedelta":
        return f"__import__('pandas').to_timedelta({_quote_string(value)})"
    if kind == "period":
        return (
            f"__import__('pandas').Period({_quote_string(value)}, "
            f"freq={_quote_string(str(descriptor.get('frequency')))})"
        )
    return repr(parsed)


def _filter_expression(
    filter_config: Mapping[str, Any],
    dataframe: Any,
) -> str:
    """Return an executable typed pandas mask expression for one filter."""
    column_lookup = _serialized_column_lookup(dataframe)
    serialized_column = str(filter_config["column"])
    if serialized_column not in column_lookup:
        raise ValueError(f"Column not found: {serialized_column}")
    dataframe_column = column_lookup[serialized_column]
    series = dataframe[dataframe_column]
    normalized = _normalized_filter_config(
        series,
        serialized_column,
        str(filter_config["operation"]),
        filter_config.get("value", ""),
    )
    operation = str(normalized["operation"])
    value = normalized["value"]
    descriptor = _filter_descriptor(series)
    kind = descriptor["filterKind"]
    column = f"_df[{dataframe_column!r}]"
    non_null = f"{column}.notna()"
    text = f"{column}.astype('string')"
    lower_text = f"{text}.str.lower()"

    if operation == "blank":
        if kind in {"text", "fallback"}:
            return f"({column}.isna() | ({text}.fillna('').str.len() == 0))"
        return f"{column}.isna()"
    if operation == "notBlank":
        if kind in {"text", "fallback"}:
            return f"~({column}.isna() | ({text}.fillna('').str.len() == 0))"
        return non_null

    if kind in {"text", "fallback"}:
        scalar = str(value)
        lower_value = _quote_string(scalar.lower())
        if operation == "contains":
            comparison = f"{lower_text}.str.contains({lower_value}, regex=False, na=False)"
        elif operation == "doesNotContain":
            comparison = f"~{lower_text}.str.contains({lower_value}, regex=False, na=False)"
        elif operation == "startsWith":
            comparison = f"{lower_text}.str.startswith({lower_value}, na=False)"
        elif operation == "endsWith":
            comparison = f"{lower_text}.str.endswith({lower_value}, na=False)"
        elif operation == "equals":
            comparison = f"({lower_text} == {lower_value})"
        elif operation == "notEquals":
            comparison = f"({lower_text} != {lower_value})"
        else:
            comparison = (
                f"{text}.str.contains({_quote_string(scalar)}, regex=True, na=False)"
            )
        return f"({non_null} & {comparison})"

    if kind in {"binary", "interval"}:
        comparison = f"({text} == {_quote_string(str(value))})"
        if operation == "notEquals":
            comparison = f"~{comparison}"
        return f"({non_null} & {comparison})"

    if operation in {"in", "notIn"}:
        typed_values = [
            _typed_value_expression(series, descriptor, item)
            for item in value
        ]
        comparison = f"{column}.isin([{', '.join(typed_values)}])"
        if operation == "notIn":
            comparison = f"~{comparison}"
        return f"({non_null} & {comparison})"

    if operation == "onDate":
        day = str(value)[:10]
        start = f"__import__('pandas').Timestamp({_quote_string(day)})"
        timezone = descriptor.get("timezone")
        if timezone:
            start += f".tz_localize({_quote_string(str(timezone))})"
        end = f"({start} + __import__('pandas').DateOffset(days=1))"
        return f"({non_null} & ({column} >= {start}) & ({column} < {end}))"

    if operation == "between":
        lower_value = str(value["lower"])
        upper_value = str(value["upper"])
        if (
            _typed_filter_value(series, descriptor, lower_value)
            > _typed_filter_value(series, descriptor, upper_value)
        ):
            raise ValueError("Between filter lower value must not exceed upper value.")
        lower = _typed_value_expression(series, descriptor, lower_value)
        upper = _typed_value_expression(series, descriptor, upper_value)
        return f"({non_null} & ({column} >= {lower}) & ({column} <= {upper}))"

    parsed = _typed_value_expression(series, descriptor, str(value))
    operators = {
        "equals": "==",
        "notEquals": "!=",
        "greaterThan": ">",
        "greaterThanOrEqual": ">=",
        "lessThan": "<",
        "lessThanOrEqual": "<=",
    }
    return f"({non_null} & ({column} {operators[operation]} {parsed}))"


def state_expression(
    source: str,
    state: Mapping[str, Any],
    dataframe: Any = None,
) -> str:
    """Generate readable pandas eval syntax for a structured table state."""
    expression = source
    filters = _state_filters(state)
    if filters and dataframe is None:
        raise ValueError("A DataFrame is required to generate typed filter expressions.")
    for filter_config in filters:
        filter_expr = _filter_expression(filter_config, dataframe)
        expression = f"{expression}.loc[lambda _df: {filter_expr}]"

    search = _state_search(state).strip()
    if search:
        expression = (
            f"{expression}.loc[lambda _df: _df.astype('string').apply("
            f"lambda row: row.str.contains({_quote_string(search)}, case=False, regex=False, na=False).any(), axis=1)]"
        )

    sort = _state_sort(state)
    group_by = _state_group_by(state)
    if sort:
        column_lookup = (
            _serialized_column_lookup(dataframe)
            if dataframe is not None
            else {}
        )
        sort_column = column_lookup.get(sort["column"], sort["column"])
        expression = (
            f"{expression}.sort_values({sort_column!r}, "
            f"ascending={sort['direction'] == 'asc'})"
        )
    elif group_by:
        column_lookup = (
            _serialized_column_lookup(dataframe)
            if dataframe is not None
            else {}
        )
        group_by_column = column_lookup.get(group_by, group_by)
        expression = f"{expression}.sort_values({group_by_column!r}, kind='stable')"

    return expression


def register_table(
    dataframe: Any,
    *,
    table_id: str,
    source: str,
    show_index: bool,
    max_cell_chars: int,
    column_descriptions: Optional[Mapping[str, str]] = None,
) -> TableRegistration:
    """Validate and register a DataFrame for backend table operations."""
    if not isinstance(source, str) or not source.strip():
        raise ValueError("ui.table requires a non-empty source expression, e.g. source='df'.")
    if not _is_dataframe(dataframe):
        raise TypeError("ui.table currently supports pandas.DataFrame objects only.")

    registration = TableRegistration(
        table_id=table_id,
        dataframe=dataframe,
        source=source.strip(),
        show_index=bool(show_index),
        max_cell_chars=max(20, int(max_cell_chars)),
        column_descriptions=_normalize_column_descriptions(column_descriptions),
    )
    _TABLES[table_id] = registration
    ensure_comm_target()
    return registration


def table_payload(
    registration: TableRegistration,
    *,
    mode: str,
    page_size: int,
    default_state: Optional[Mapping[str, JsonValue]] = None,
) -> Dict[str, JsonValue]:
    """Build JSON props for a Table primitive without embedding the full DataFrame."""
    if mode not in {"paginated", "virtual"}:
        raise ValueError("ui.table mode must be 'paginated' or 'virtual'.")
    normalized_page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))
    initial_state: Mapping[str, JsonValue] = default_state or {
        "search": "",
        "sort": None,
        "filters": [],
        "groupBy": None,
    }
    initial = get_table_window(
        registration.table_id,
        initial_state,
        0,
        normalized_page_size,
    )
    return {
        "tableId": registration.table_id,
        "source": registration.source,
        "mode": mode,
        "pageSize": normalized_page_size,
        "showIndex": registration.show_index,
        "maxCellChars": registration.max_cell_chars,
        "shape": [int(registration.dataframe.shape[0]), int(registration.dataframe.shape[1])],
        "columns": _column_metadata(registration.dataframe, registration.column_descriptions),
        "defaultState": initial_state,
        "initialWindow": initial,
    }


def _table_not_registered_message(action: Optional[str]) -> str:
    """Return a user-facing message when a table is missing from the kernel registry."""
    run_cell = (
        "Run the cell that displays this table. "
        "If you restarted the kernel, run it again."
    )
    messages = {
        "fetch": (
            "This table is showing saved output. "
            f"{run_cell} Then you can sort, filter, search, or change pages."
        ),
        "stats": (
            "This table is showing saved output. "
            f"{run_cell} Then you can view column statistics."
        ),
        "export_csv": (
            "This table is showing saved output. "
            f"{run_cell} Then you can export or copy the full table."
        ),
        "expression": (
            "This table is showing saved output. "
            f"{run_cell} Then you can save the current view expression."
        ),
        "filter_value": (
            "This table is showing saved output. "
            f"{run_cell} Then you can create filters from selected cells."
        ),
    }
    return messages.get(
        action,
        f"This table is showing saved output. {run_cell}",
    )


def _require_table(table_id: str, *, action: Optional[str] = None) -> TableRegistration:
    """Return a registered table or raise a helpful key error."""
    if table_id not in _TABLES:
        raise KeyError(_table_not_registered_message(action))
    return _TABLES[table_id]


def _handle_request(data: Mapping[str, Any]) -> Dict[str, JsonValue]:
    """Handle one frontend table comm request."""
    action = data.get("action")
    table_id = data.get("tableId")
    if not isinstance(table_id, str):
        raise ValueError("tableId must be a string.")

    state = data.get("state")
    table_state = state if isinstance(state, Mapping) else {}

    if action == "fetch":
        return get_table_window(
            table_id,
            table_state,
            int(data.get("offset", 0)),
            int(data.get("limit", 50)),
            action="fetch",
        )
    if action == "stats":
        column = data.get("column")
        if not isinstance(column, str):
            raise ValueError("column must be a string for stats requests.")
        return column_stats(table_id, column, table_state, action="stats")
    if action == "export_csv":
        columns = data.get("columns")
        visible_columns = columns if isinstance(columns, Sequence) else []
        return export_csv(
            table_id,
            table_state,
            [column for column in visible_columns if isinstance(column, str)],
            action="export_csv",
        )
    if action == "expression":
        registration = _require_table(table_id, action="expression")
        return {
            "expression": state_expression(
                registration.source,
                table_state,
                registration.dataframe,
            )
        }
    if action == "filter_value":
        column = data.get("column")
        row_number = data.get("rowNumber")
        if not isinstance(column, str) or not isinstance(row_number, int):
            raise ValueError(
                "column and rowNumber are required for filter-value requests."
            )
        return filter_value(
            table_id,
            column,
            row_number,
            table_state,
            action="filter_value",
        )

    raise ValueError(f"Unknown Orion table action: {action}")


def _comm_message_data(msg: Any) -> Mapping[str, Any]:
    """Extract comm payload data from ipykernel dict or object messages."""
    if isinstance(msg, Mapping):
        content = msg.get("content", {})
    else:
        content = getattr(msg, "content", {})

    if not isinstance(content, Mapping):
        return {}

    data = content.get("data", {})
    return data if isinstance(data, Mapping) else {}


def ensure_comm_target() -> None:
    """Register the Jupyter comm target used by Orion table outputs."""
    global _COMM_TARGET_REGISTERED
    if _COMM_TARGET_REGISTERED:
        return

    try:
        from IPython import get_ipython  # type: ignore
    except ImportError:
        get_ipython = None

    if get_ipython is None:
        ip = None
    else:
        ip = get_ipython()

    if ip is None or not getattr(ip, "kernel", None):
        return

    def _target(comm: Any, _open_msg: Any) -> None:
        def _on_msg(msg: Any) -> None:
            data = _comm_message_data(msg)
            if not data:
                return
            request_id = data.get("requestId")
            try:
                result = _handle_request(data)
                comm.send({"requestId": request_id, "ok": True, "result": result})
            except Exception as exc:  # pragma: no cover - exercised through frontend integration.
                comm.send({"requestId": request_id, "ok": False, "error": str(exc)})

        comm.on_msg(_on_msg)

    ip.kernel.comm_manager.register_target(TABLE_COMM_TARGET, _target)
    _COMM_TARGET_REGISTERED = True


def clear_registry() -> None:
    """Clear registered tables; intended for tests."""
    _TABLES.clear()
