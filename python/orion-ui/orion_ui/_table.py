"""Backend runtime for Orion UI DataFrame table outputs."""

from __future__ import annotations

import csv
import io
import math
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

JsonValue = Any

TABLE_COMM_TARGET = "orion.ui.table"
MAX_PAGE_SIZE = 500
MAX_EXPORT_ROWS = 100_000

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


def _state_filters(state: Mapping[str, Any]) -> List[Dict[str, str]]:
    """Extract structured filters from a frontend table state."""
    filters = state.get("filters")
    if not isinstance(filters, Sequence) or isinstance(filters, (str, bytes)):
        return []

    result: List[Dict[str, str]] = []
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
                    "value": "" if value is None else str(value),
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


def _filter_mask(series: Any, operation: str, value: str) -> Any:
    """Build a pandas boolean mask for one structured filter."""
    pd = _import_pandas()
    text = series.astype("string")
    lower_text = text.str.lower()
    lower_value = value.lower()

    if operation == "contains":
        return lower_text.str.contains(re.escape(lower_value), na=False)
    if operation == "doesNotContain":
        return ~lower_text.str.contains(re.escape(lower_value), na=False)
    if operation == "equals":
        return lower_text.fillna("") == lower_value
    if operation == "notEquals":
        return lower_text.fillna("") != lower_value
    if operation == "blank":
        return series.isna() | (text.fillna("").str.len() == 0)
    if operation == "notBlank":
        return ~(series.isna() | (text.fillna("").str.len() == 0))
    if operation == "regex":
        try:
            return text.str.contains(value, regex=True, na=False)
        except re.error:
            return pd.Series([False] * len(series), index=series.index)

    numeric = pd.to_numeric(series, errors="coerce")
    try:
        numeric_value = float(value)
    except ValueError:
        return pd.Series([False] * len(series), index=series.index)

    if operation == "greaterThan":
        return numeric > numeric_value
    if operation == "greaterThanOrEqual":
        return numeric >= numeric_value
    if operation == "lessThan":
        return numeric < numeric_value
    if operation == "lessThanOrEqual":
        return numeric <= numeric_value

    return lower_text.str.contains(re.escape(lower_value), na=False)


def _apply_operations(registration: TableRegistration, state: Mapping[str, Any]) -> Any:
    """Apply backend search/filter/sort/group operations to a DataFrame."""
    df = registration.dataframe

    for filter_config in _state_filters(state):
        column = filter_config["column"]
        if column not in df.columns:
            continue
        mask = _filter_mask(
            df[column],
            filter_config["operation"],
            filter_config["value"],
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
    if sort and sort["column"] in df.columns:
        df = df.sort_values(
            sort["column"],
            ascending=sort["direction"] == "asc",
            kind="mergesort",
        )

    group_by = _state_group_by(state)
    if group_by and group_by in df.columns:
        df = df.sort_values(group_by, kind="mergesort")

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
    if group_by and group_by in df.columns:
        counts = df[group_by].value_counts(dropna=False)
        group_counts = {str(key): int(value) for key, value in counts.items()}

    rows: List[Dict[str, JsonValue]] = []
    for absolute_index, (index_value, row) in enumerate(sliced.iterrows(), start=offset):
        serialized: Dict[str, JsonValue] = {"__rowNumber": absolute_index}
        if registration.show_index:
            serialized["__index__"] = _json_scalar(index_value, registration.max_cell_chars)
        if group_by and group_by in df.columns:
            group_value = _json_scalar(row[group_by], registration.max_cell_chars)
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
) -> Dict[str, JsonValue]:
    """Return a bounded, operation-aware row window for a registered table."""
    registration = _require_table(table_id)
    table_state = state or {}
    df = _apply_operations(registration, table_state)
    group_by = _state_group_by(table_state)
    rows, group_counts = _row_dicts(registration, df, offset, limit, group_by)

    return {
        "tableId": table_id,
        "columns": _table_columns(registration, df),
        "rows": rows,
        "offset": max(0, int(offset)),
        "limit": max(1, min(int(limit), MAX_PAGE_SIZE)),
        "totalRows": int(len(df)),
        "sourceRows": int(len(registration.dataframe)),
        "totalColumns": int(len(registration.dataframe.columns)),
        "groupBy": group_by,
        "groupCounts": group_counts,
        "expression": state_expression(registration.source, table_state),
    }


def column_stats(table_id: str, column: str, state: Optional[Mapping[str, Any]] = None) -> Dict[str, JsonValue]:
    """Return backend-computed stats for one visible DataFrame column."""
    pd = _import_pandas()
    registration = _require_table(table_id)
    df = _apply_operations(registration, state or {})
    if column not in df.columns:
        raise KeyError(f"Column not found: {column}")

    series = df[column]
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


def export_csv(
    table_id: str,
    state: Optional[Mapping[str, Any]] = None,
    columns: Optional[Iterable[str]] = None,
    max_rows: int = MAX_EXPORT_ROWS,
) -> Dict[str, JsonValue]:
    """Return CSV text for the current backend table view with a row cap."""
    registration = _require_table(table_id)
    df = _apply_operations(registration, state or {})
    selected_columns = [column for column in columns or [] if column in df.columns]
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
        "expression": state_expression(registration.source, state or {}),
    }


def _quote_column(column: str) -> str:
    """Return a pandas query-safe column reference."""
    return f"`{column.replace('`', '``')}`"


def _quote_string(value: str) -> str:
    """Return a Python string literal for generated expression metadata."""
    return repr(value)


def _filter_expression(filter_config: Mapping[str, str]) -> Optional[str]:
    """Return a pandas query expression for a structured filter when possible."""
    column = _quote_column(filter_config["column"])
    operation = filter_config["operation"]
    value = filter_config["value"]

    if operation == "equals":
        return f"{column} == {_quote_string(value)}"
    if operation == "notEquals":
        return f"{column} != {_quote_string(value)}"
    if operation == "greaterThan":
        return f"{column} > {value}"
    if operation == "greaterThanOrEqual":
        return f"{column} >= {value}"
    if operation == "lessThan":
        return f"{column} < {value}"
    if operation == "lessThanOrEqual":
        return f"{column} <= {value}"
    if operation == "blank":
        return f"{column}.isna()"
    if operation == "notBlank":
        return f"{column}.notna()"
    if operation == "contains":
        return f"{column}.astype('string').str.contains({_quote_string(value)}, case=False, na=False)"
    if operation == "doesNotContain":
        return f"~{column}.astype('string').str.contains({_quote_string(value)}, case=False, na=False)"
    if operation == "regex":
        return f"{column}.astype('string').str.contains({_quote_string(value)}, regex=True, na=False)"
    return None


def state_expression(source: str, state: Mapping[str, Any]) -> str:
    """Generate readable pandas eval syntax for a structured table state."""
    expression = source
    filters = [_filter_expression(filter_config) for filter_config in _state_filters(state)]
    for filter_expr in filters:
        if filter_expr:
            expression = f"{expression}.query({_quote_string(filter_expr)})"

    search = _state_search(state).strip()
    if search:
        expression = (
            f"{expression}.loc[{source}.astype('string').apply("
            f"lambda row: row.str.contains({_quote_string(search)}, case=False, regex=False, na=False).any(), axis=1)]"
        )

    sort = _state_sort(state)
    group_by = _state_group_by(state)
    if sort:
        expression = (
            f"{expression}.sort_values({_quote_string(sort['column'])}, "
            f"ascending={sort['direction'] == 'asc'})"
        )
    elif group_by:
        expression = f"{expression}.sort_values({_quote_string(group_by)}, kind='stable')"

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
) -> Dict[str, JsonValue]:
    """Build JSON props for a Table primitive without embedding the full DataFrame."""
    if mode not in {"paginated", "virtual"}:
        raise ValueError("ui.table mode must be 'paginated' or 'virtual'.")
    normalized_page_size = max(1, min(int(page_size), MAX_PAGE_SIZE))
    initial = get_table_window(registration.table_id, {}, 0, normalized_page_size)
    return {
        "tableId": registration.table_id,
        "source": registration.source,
        "mode": mode,
        "pageSize": normalized_page_size,
        "showIndex": registration.show_index,
        "maxCellChars": registration.max_cell_chars,
        "shape": [int(registration.dataframe.shape[0]), int(registration.dataframe.shape[1])],
        "columns": _column_metadata(registration.dataframe, registration.column_descriptions),
        "initialWindow": initial,
    }


def _require_table(table_id: str) -> TableRegistration:
    """Return a registered table or raise a helpful key error."""
    if table_id not in _TABLES:
        raise KeyError(f"Orion table is no longer registered in the kernel: {table_id}")
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
        )
    if action == "stats":
        column = data.get("column")
        if not isinstance(column, str):
            raise ValueError("column must be a string for stats requests.")
        return column_stats(table_id, column, table_state)
    if action == "export_csv":
        columns = data.get("columns")
        visible_columns = columns if isinstance(columns, Sequence) else []
        return export_csv(
            table_id,
            table_state,
            [column for column in visible_columns if isinstance(column, str)],
        )
    if action == "expression":
        registration = _require_table(table_id)
        return {"expression": state_expression(registration.source, table_state)}

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
