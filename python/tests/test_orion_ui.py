import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import ModuleType
from unittest.mock import patch

import orion_ui as ui
from orion_ui import _runtime, _table

try:
    import pandas as pd
except ImportError:  # pragma: no cover - depends on local test environment.
    pd = None


class PlotlyTemplateRegistry(dict):
    """Dict-like stand-in for Plotly's template registry."""


class DisplayFormatterStub:
    """Small IPython display formatter stand-in for version wrapper tests."""

    def __init__(self, formats):
        self.formats = formats

    def format(self, value):
        return self.formats[id(value)]


class ShellStub:
    """IPython shell stand-in exposing a display formatter."""

    def __init__(self, formats):
        self.display_formatter = DisplayFormatterStub(formats)


class OrionUiTests(unittest.TestCase):
    def setUp(self):
        _runtime._STATE.clear()
        _runtime._OUTPUT_STATE.clear()
        _table.clear_registry()

    def test_repr_mimebundle_emits_orion_payload_and_fallbacks(self):
        controls = ui.card(
            ui.stack(
                ui.select("model", ["gpt-4.1", "claude"], label="Model"),
                ui.slider(
                    "temperature",
                    label="Temperature",
                    min=0,
                    max=2,
                    default_value=0.7,
                    step=0.1,
                ),
            ),
            title="Controls",
        )

        bundle = controls._repr_mimebundle_()
        self.assertIn(ui.ORION_UI_MIME_TYPE, bundle)
        self.assertIn("text/html", bundle)
        self.assertIn("text/plain", bundle)
        payload = bundle[ui.ORION_UI_MIME_TYPE]
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["root"]["type"], "Card")
        self.assertEqual(payload["state"]["temperature"], 0.7)
        self.assertEqual(payload["bindings"]["temperature"]["valueType"], "number")

    def test_version_emits_current_rich_bundle_and_history_envelope(self):
        value = object()
        formats = {
            id(value): (
                {"text/html": "<strong>Current</strong>", "text/plain": "Current"},
                {"text/html": {"isolated": True}},
            )
        }

        with patch.object(ui, "_get_ipython_shell", return_value=ShellStub(formats)):
            bundle = ui.version(value, key="chart", max_versions=4)._repr_mimebundle_()

        self.assertEqual(bundle["text/html"], "<strong>Current</strong>")
        payload = bundle[ui.ORION_VERSIONED_OUTPUT_MIME_TYPE]
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["key"], "chart")
        self.assertEqual(payload["maxVersions"], 4)
        self.assertEqual(payload["history"], [])
        self.assertTrue(payload["current"]["id"].startswith("orion-version-"))
        self.assertTrue(payload["current"]["createdAt"].endswith("Z"))
        self.assertEqual(
            payload["current"]["metadata"],
            {"text/html": {"isolated": True}},
        )

    def test_version_promotes_axes_like_values_to_their_rich_figure(self):
        figure = object()

        class AxesLike:
            """Matplotlib-like value with an owning figure."""

            def __init__(self, owner):
                self.figure = owner

        axes = AxesLike(figure)
        formats = {
            id(axes): ({"text/plain": "<Axes>"}, {}),
            id(figure): (
                {"image/png": "encoded-png", "text/plain": "<Figure>"},
                {"image/png": {"width": 640}},
            ),
        }

        with patch.object(ui, "_get_ipython_shell", return_value=ShellStub(formats)):
            bundle = ui.version(axes)._repr_mimebundle_()

        self.assertEqual(bundle["image/png"], "encoded-png")
        payload = bundle[ui.ORION_VERSIONED_OUTPUT_MIME_TYPE]
        self.assertEqual(
            payload["current"]["metadata"],
            {"image/png": {"width": 640}},
        )

    def test_version_uses_rich_repr_fallback_outside_ipython(self):
        class HtmlValue:
            """Value exposing a standard HTML rich representation."""

            def _repr_html_(self):
                return "<em>fallback</em>"

            def __repr__(self):
                return "HtmlValue()"

        with patch.object(ui, "_get_ipython_shell", return_value=None):
            bundle = ui.version(HtmlValue())._repr_mimebundle_()

        self.assertEqual(bundle["text/html"], "<em>fallback</em>")
        self.assertEqual(bundle["text/plain"], "HtmlValue()")

    def test_version_validates_identity_and_retention(self):
        with self.assertRaises(ValueError):
            ui.version(object(), key="")
        with self.assertRaises(TypeError):
            ui.version(object(), max_versions=True)
        with self.assertRaises(TypeError):
            ui.version(object(), max_versions=2.5)
        with self.assertRaises(ValueError):
            ui.version(object(), max_versions=0)

    def test_version_is_exported(self):
        self.assertIn("version", ui.__all__)
        self.assertIn("VersionedOutput", ui.__all__)

    def test_default_value_does_not_overwrite_existing_runtime_state_on_rerun(self):
        first = ui.select("model", ["option A", "option B", "option C"], default_value="option A")
        self.assertEqual(first._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]["state"]["model"], "option A")

        ui.set("model", "option C")
        rerun = ui.select("model", ["option A", "option B", "option C"], default_value="option A")
        payload = rerun._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]

        self.assertEqual(payload["root"]["props"]["defaultValue"], "option A")
        self.assertEqual(payload["state"]["model"], "option C")
        self.assertEqual(ui.get("model"), "option C")

    def test_value_forces_runtime_state_on_rerun(self):
        ui.select("model", ["option A", "option B", "option C"], default_value="option A")
        ui.set("model", "option C")
        forced = ui.select("model", ["option A", "option B", "option C"], default_value="option A", value="option A")
        payload = forced._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]

        self.assertEqual(payload["root"]["props"]["defaultValue"], "option A")
        self.assertEqual(payload["state"]["model"], "option A")
        self.assertEqual(ui.get("model"), "option A")

    def test_define_default_only_sets_missing_state(self):
        self.assertEqual(ui.define_default("region", "west"), "west")
        ui.set("region", "east")
        self.assertEqual(ui.define_default("region", "west"), "east")
        self.assertEqual(ui.get("region"), "east")

    def test_rejects_unsupported_prop_values(self):
        with self.assertRaises(TypeError):
            ui.button("Bad", action={"callback": object()})

    def test_change_actions_serialize_for_every_editable_control(self):
        action = {"type": "execute_cells", "cellIds": ["analysis-cell"]}
        controls = [
            ui.input("input", on_change=action, debounce_ms=125),
            ui.textarea("textarea", on_change=action, debounce_ms=125),
            ui.select("select", ["a", "b"], on_change=action, debounce_ms=125),
            ui.slider("slider", on_change=action, debounce_ms=125),
            ui.checkbox("checkbox", on_change=action, debounce_ms=125),
            ui.switch("switch", on_change=action, debounce_ms=125),
            ui.radio_group("radio", ["a", "b"], on_change=action, debounce_ms=125),
            ui.toggle("toggle", on_change=action, debounce_ms=125),
            ui.toggle_group("toggle_group", ["a", "b"], on_change=action, debounce_ms=125),
            ui.calendar("calendar", on_change=action, debounce_ms=125),
            ui.date_picker("date_picker", on_change=action, debounce_ms=125),
            ui.date_range_slider("date_range", on_change=action, debounce_ms=125),
            ui.date_time_picker("date_time", on_change=action, debounce_ms=125),
        ]

        for control in controls:
            with self.subTest(control=control.type):
                payload = control._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]
                self.assertEqual(payload["root"]["props"]["onChange"], action)
                self.assertEqual(payload["root"]["props"]["debounceMs"], 125)

        date_time_payload = controls[-1]._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]
        self.assertEqual(
            set(date_time_payload["bindings"]),
            {"date_time", "date_time_start_time", "date_time_end_time"},
        )

    def test_change_action_props_are_omitted_by_default(self):
        props = ui.input("query")._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]["root"]["props"]

        self.assertNotIn("onChange", props)
        self.assertNotIn("debounceMs", props)

    def test_change_action_arguments_are_validated(self):
        with self.assertRaises(TypeError):
            ui.input("query", on_change="not-a-mapping")
        with self.assertRaises(TypeError):
            ui.input("query", on_change={"callback": object()})
        with self.assertRaises(TypeError):
            ui.input("query", debounce_ms=1.5)
        with self.assertRaises(TypeError):
            ui.input("query", debounce_ms=True)
        with self.assertRaises(ValueError):
            ui.input("query", debounce_ms=-1)

    def test_date_range_slider_is_exported(self):
        self.assertIn("date_range_slider", ui.__all__)

    def test_state_api_round_trips_values(self):
        ui.set("region", "west")
        self.assertEqual(ui.get("region"), "west")
        snapshot = ui.state()
        self.assertEqual(snapshot["region"], "west")
        snapshot["region"] = "mutated"
        self.assertEqual(ui.get("region"), "west")

    def test_new_primitive_helpers_serialize_expected_types(self):
        component = ui.card(
            ui.stack(
                ui.radio_group("mode", ["fast", "accurate"], default_value="fast"),
                ui.toggle_group("view", ["chart", "table"], default_value="chart"),
                ui.date_picker("start_date", default_value="2026-05-26"),
                ui.date_range_slider(
                    "analysis_window",
                    label="Analysis window",
                    default_value='{"from":"2026-06-01","to":"2026-06-07"}',
                    visible_months=3,
                ),
                ui.progress("completion", default_value=25, max=100),
                ui.alert(title="Status", description="Ready"),
                ui.avatar(fallback="OR"),
                ui.popover(ui.label("Details"), label="More info"),
                ui.carousel(ui.label("Slide 1"), ui.label("Slide 2")),
                ui.collapsible(ui.label("Hidden content"), label="Expand"),
                ui.accordion(ui.card(ui.label("Panel"), title="Panel 1")),
            ),
            title="New primitives",
        )

        payload = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]
        root = payload["root"]
        stack_children = root["children"][0]["children"]

        self.assertEqual(stack_children[0]["type"], "RadioGroup")
        self.assertEqual(stack_children[1]["type"], "ToggleGroup")
        self.assertEqual(stack_children[2]["type"], "DatePicker")
        self.assertEqual(stack_children[3]["type"], "DateRangeSlider")
        self.assertEqual(stack_children[4]["type"], "Progress")
        self.assertEqual(stack_children[5]["type"], "Alert")
        self.assertEqual(stack_children[6]["type"], "Avatar")
        self.assertEqual(stack_children[7]["type"], "Popover")
        self.assertEqual(stack_children[8]["type"], "Carousel")
        self.assertEqual(stack_children[9]["type"], "Collapsible")
        self.assertEqual(stack_children[10]["type"], "Accordion")
        self.assertEqual(payload["state"]["mode"], "fast")
        self.assertEqual(payload["state"]["view"], "chart")
        self.assertEqual(payload["state"]["start_date"], "2026-05-26")
        self.assertEqual(
            payload["state"]["analysis_window"],
            '{"from":"2026-06-01","to":"2026-06-07"}',
        )
        self.assertEqual(stack_children[3]["props"]["visibleMonths"], 3)
        self.assertEqual(payload["state"]["completion"], 25)

    def test_class_name_serializes_to_class_name_prop(self):
        component = ui.card(
            ui.label("Revenue", class_name="metric-label"),
            title="Metric",
            class_name="metric-card",
        )

        payload = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]
        self.assertEqual(payload["root"]["props"]["className"], "metric-card")
        self.assertEqual(
            payload["root"]["children"][0]["props"]["className"],
            "metric-label",
        )

    def test_class_name_must_be_a_string(self):
        with self.assertRaises(TypeError):
            ui.card(class_name=123)

    def test_plotly_theme_styles_table_traces_like_chat_tables(self):
        plotly_module = ModuleType("plotly")
        plotly_io_module = ModuleType("plotly.io")
        plotly_io_module.templates = PlotlyTemplateRegistry()
        plotly_module.io = plotly_io_module

        with patch.dict(
            "sys.modules",
            {"plotly": plotly_module, "plotly.io": plotly_io_module},
        ):
            template = ui.theme.plotly(name="orion-test", set_default=True)

        table_trace = template["data"]["table"][0]
        header = table_trace["header"]
        cells = table_trace["cells"]

        self.assertIs(plotly_io_module.templates["orion-test"], template)
        self.assertEqual(plotly_io_module.templates.default, "orion-test")
        self.assertEqual(header["fill"]["color"], "#e4e4e7")
        self.assertEqual(cells["fill"]["color"], "#f4f4f5")
        self.assertEqual(header["line"], {"color": "#e4e4e7", "width": 1})
        self.assertEqual(cells["line"], {"color": "#e4e4e7", "width": 1})
        self.assertEqual(header["align"], "left")
        self.assertEqual(cells["align"], "left")
        self.assertEqual(header["height"], 28)
        self.assertEqual(cells["height"], 28)
        self.assertEqual(header["font"]["weight"], 600)
        self.assertEqual(cells["font"]["size"], 12)
        self.assertNotIn("margin", template["layout"])
        self.assertNotIn("legend", template["layout"])
        self.assertIs(template["layout"]["xaxis"]["automargin"], True)
        self.assertIs(template["layout"]["yaxis"]["automargin"], True)

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_payload_contains_bounded_initial_window(self):
        df = pd.DataFrame({"status": ["active"] * 120, "score": list(range(120))})

        component = ui.table(df, source="df", page_size=10)
        payload = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]
        props = payload["root"]["props"]

        self.assertEqual(payload["root"]["type"], "Table")
        self.assertEqual(props["source"], "df")
        self.assertNotIn("title", props)
        self.assertEqual(props["shape"], [120, 2])
        self.assertEqual(props["initialWindow"]["totalRows"], 120)
        self.assertEqual(len(props["initialWindow"]["rows"]), 10)
        self.assertNotIn("rows", props["columns"][0])

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_payload_contains_column_descriptions(self):
        df = pd.DataFrame({"status": ["active"], "score": [9]})

        component = ui.table(
            df,
            source="df",
            column_descriptions={
                "__index__": "Original DataFrame index.",
                "status": "Current account status.",
                "score": "Priority score from 1 to 10.",
            },
        )
        table_id = component.props["tableId"]
        window = _table.get_table_window(table_id)
        props = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]["root"]["props"]

        self.assertEqual(
            props["initialWindow"]["columns"][0]["description"],
            "Original DataFrame index.",
        )
        self.assertEqual(
            props["columns"][0]["description"],
            "Current account status.",
        )
        self.assertEqual(
            window["columns"][2]["description"],
            "Priority score from 1 to 10.",
        )

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_defaults_filter_and_sort_the_initial_window(self):
        df = pd.DataFrame(
            {
                "status": ["active", "paused", "active"],
                "score": [2, 9, 1],
            }
        )

        component = ui.table(
            df,
            source="df",
            show_index=False,
            default_filters=[
                {"column": "status", "operation": "equals", "value": "active"},
            ],
            default_sort={"column": "score", "direction": "desc"},
        )
        props = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]["root"]["props"]

        self.assertEqual(
            props["defaultState"],
            {
                "search": "",
                "sort": {"column": "score", "direction": "desc"},
                "filters": [
                    {"column": "status", "operation": "equals", "value": "active"},
                ],
                "groupBy": None,
            },
        )
        self.assertEqual(
            [row["score"] for row in props["initialWindow"]["rows"]], [2, 1]
        )

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_operations_resolve_non_string_column_labels(self):
        df = pd.DataFrame(
            {
                1: ["active", "paused", "active"],
                2: [2, 9, 1],
            }
        )

        component = ui.table(
            df,
            source="df",
            show_index=False,
            default_filters=[
                {"column": "1", "operation": "equals", "value": "active"},
            ],
            default_sort={"column": "2", "direction": "desc"},
        )
        table_id = component.props["tableId"]
        props = component._repr_mimebundle_()[ui.ORION_UI_MIME_TYPE]["root"]["props"]
        stats = _table.column_stats(table_id, "2")
        exported = _table.export_csv(table_id, columns=["1"])

        self.assertEqual(
            [row["2"] for row in props["initialWindow"]["rows"]],
            [2, 1],
        )
        self.assertEqual(stats["sum"], 12.0)
        self.assertEqual(exported["csv"].splitlines()[0], "1")
        self.assertIn(
            ".sort_values(2, ascending=False)",
            props["initialWindow"]["expression"],
        )

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_defaults_reject_ambiguous_serialized_column_labels(self):
        df = pd.DataFrame([[1, 2]], columns=[1, "1"])

        with self.assertRaisesRegex(ValueError, "ambiguous"):
            ui.table(
                df,
                source="df",
                default_sort={"column": "1", "direction": "asc"},
            )

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_column_description_values_must_be_strings(self):
        df = pd.DataFrame({"status": ["active"]})

        with self.assertRaises(TypeError):
            ui.table(df, source="df", column_descriptions={"status": 1})

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_backend_filters_sorts_groups_and_generates_expression(self):
        df = pd.DataFrame(
            {
                "status": ["active", "paused", "active", "active"],
                "score": [2, 4, 1, 9],
            }
        )
        component = ui.table(df, source="df", page_size=2)
        table_id = component.props["tableId"]

        state = {
            "filters": [{"column": "status", "operation": "equals", "value": "active"}],
            "sort": {"column": "score", "direction": "desc"},
            "groupBy": "status",
        }
        window = _table.get_table_window(table_id, state, offset=0, limit=2)

        self.assertEqual(window["totalRows"], 3)
        self.assertEqual([row["score"] for row in window["rows"]], [9, 2])
        self.assertEqual(window["groupBy"], "status")
        self.assertEqual(window["groupCounts"]["active"], 3)
        self.assertIn("df.loc[lambda _df:", window["expression"])
        self.assertIn(".sort_values('score', ascending=False)", window["expression"])

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_column_metadata_advertises_semantic_filter_capabilities(self):
        ordered_category = pd.CategoricalDtype(["low", "medium", "high"], ordered=True)
        df = pd.DataFrame(
            {
                "text": pd.Series(["alpha", None], dtype="string"),
                "category": pd.Series(["low", "high"], dtype=ordered_category),
                "boolean": pd.Series([True, None], dtype="boolean"),
                "integer": pd.Series([1, None], dtype="Int64"),
                "date": [date(2026, 1, 1), None],
                "datetime": pd.to_datetime(
                    ["2026-01-01T10:00:00Z", None],
                    utc=True,
                ),
                "duration": pd.to_timedelta(["1 day", None]),
                "period": pd.Series([pd.Period("2026-01", freq="M"), None]),
                "complex": pd.Series([1 + 2j, None], dtype="complex128"),
                "interval": pd.Series([pd.Interval(0, 1), None]),
                "binary": [b"alpha", None],
                "mixed": [{"a": 1}, ["b"]],
                "empty": [None, None],
                "sparse": pd.arrays.SparseArray([1.0, 0.0]),
            }
        )

        metadata = {
            column["key"]: column
            for column in _table._column_metadata(df)
        }

        self.assertEqual(metadata["text"]["filterKind"], "text")
        self.assertNotIn("lessThan", metadata["text"]["filterOperations"])
        self.assertEqual(metadata["category"]["filterKind"], "categorical")
        self.assertTrue(metadata["category"]["ordered"])
        self.assertIn("between", metadata["category"]["filterOperations"])
        self.assertEqual(metadata["boolean"]["filterKind"], "boolean")
        self.assertEqual(metadata["integer"]["numericType"], "integer")
        self.assertEqual(metadata["date"]["filterKind"], "date")
        self.assertEqual(metadata["datetime"]["timezone"], "UTC")
        self.assertEqual(metadata["duration"]["filterKind"], "timedelta")
        self.assertEqual(metadata["period"]["filterKind"], "period")
        self.assertEqual(metadata["complex"]["filterOperations"], [
            "equals",
            "notEquals",
            "blank",
            "notBlank",
        ])
        self.assertEqual(metadata["interval"]["filterKind"], "interval")
        self.assertEqual(metadata["binary"]["filterKind"], "binary")
        self.assertEqual(metadata["mixed"]["filterKind"], "fallback")
        self.assertEqual(metadata["empty"]["filterOperations"], ["blank", "notBlank"])
        self.assertEqual(metadata["sparse"]["filterKind"], "number")

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_backend_applies_typed_filters_and_excludes_missing_values(self):
        df = pd.DataFrame(
            {
                "number": pd.Series([1, 2, None, 4], dtype="Int64"),
                "decimal": [Decimal("1.1"), Decimal("2.2"), None, Decimal("4.4")],
                "boolean": pd.Series([True, False, None, True], dtype="boolean"),
                "category": pd.Categorical(["a", "b", None, "c"]),
                "date": [
                    date(2026, 1, 1),
                    date(2026, 1, 2),
                    None,
                    date(2026, 1, 4),
                ],
                "duration": pd.to_timedelta(["1 day", "2 days", None, "4 days"]),
                "period": pd.Series(
                    [
                        pd.Period("2026-01", freq="M"),
                        pd.Period("2026-02", freq="M"),
                        None,
                        pd.Period("2026-04", freq="M"),
                    ]
                ),
            }
        )
        component = ui.table(df, source="df", show_index=False)
        table_id = component.props["tableId"]

        cases = [
            ("number", "between", {"lower": "2", "upper": "4"}, [2, 4]),
            ("decimal", "greaterThan", "2.1", [Decimal("2.2"), Decimal("4.4")]),
            ("boolean", "equals", "true", [True, True]),
            ("category", "in", ["a", "c"], ["a", "c"]),
            ("date", "greaterThan", "2026-01-01", [date(2026, 1, 2), date(2026, 1, 4)]),
            ("duration", "lessThanOrEqual", "2 days", list(pd.to_timedelta(["1 day", "2 days"]))),
            ("period", "greaterThan", "2026-01", [pd.Period("2026-02", freq="M"), pd.Period("2026-04", freq="M")]),
        ]
        for column, operation, value, expected in cases:
            with self.subTest(column=column, operation=operation):
                result = _table._apply_operations(
                    _table._require_table(table_id),
                    {
                        "filters": [
                            {
                                "column": column,
                                "operation": operation,
                                "value": value,
                            }
                        ]
                    },
                )
                self.assertEqual(result[column].tolist(), expected)

        not_equal = _table._apply_operations(
            _table._require_table(table_id),
            {
                "filters": [
                    {"column": "number", "operation": "notEquals", "value": "2"}
                ]
            },
        )
        self.assertEqual(not_equal["number"].tolist(), [1, 4])

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_datetime_filters_respect_timezone_calendar_days_and_expressions(self):
        timestamps = pd.to_datetime(
            [
                "2026-03-08 00:30:00",
                "2026-03-08 23:30:00",
                "2026-03-09 00:00:00",
                None,
            ]
        ).tz_localize("America/New_York")
        df = pd.DataFrame({"created_at": timestamps, "value": [1, 2, 3, 4]})
        component = ui.table(df, source="df", show_index=False)
        table_id = component.props["tableId"]
        state = {
            "search": "",
            "sort": None,
            "filters": [
                {
                    "column": "created_at",
                    "operation": "onDate",
                    "value": "2026-03-08",
                }
            ],
            "groupBy": None,
        }

        window = _table.get_table_window(table_id, state)
        evaluated = eval(window["expression"], {"df": df})

        self.assertEqual([row["value"] for row in window["rows"]], [1, 2])
        self.assertEqual(evaluated["value"].tolist(), [1, 2])

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_rejects_invalid_operations_and_returns_untruncated_filter_values(self):
        long_value = "x" * 500
        df = pd.DataFrame({"name": [long_value], "score": [1]})

        with self.assertRaisesRegex(ValueError, "unsupported.*name.*object"):
            ui.table(
                df,
                source="df",
                default_filters=[
                    {"column": "name", "operation": "lessThan", "value": "z"}
                ],
            )

        component = ui.table(df, source="df", max_cell_chars=20)
        table_id = component.props["tableId"]
        value = _table.filter_value(table_id, "name", 0)

        self.assertEqual(value["value"], long_value)
        with self.assertRaisesRegex(ValueError, "unsupported.*name"):
            _table.get_table_window(
                table_id,
                {
                    "filters": [
                        {"column": "name", "operation": "lessThan", "value": "z"}
                    ]
                },
            )

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_large_categories_omit_multi_value_filter_operations(self):
        categories = [f"value-{index}" for index in range(201)]
        series = pd.Series(
            pd.Categorical(["value-0"], categories=categories)
        )

        metadata = _table._column_metadata(pd.DataFrame({"category": series}))[0]

        self.assertNotIn("filterOptions", metadata)
        self.assertNotIn("in", metadata["filterOperations"])
        self.assertIn("equals", metadata["filterOperations"])

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_column_stats_and_export_are_backend_limited(self):
        df = pd.DataFrame({"name": ["a", "b", "a"], "score": [1, 2, 3]})
        component = ui.table(df, source="df", show_index=False)
        table_id = component.props["tableId"]

        stats = _table.column_stats(table_id, "score")
        exported = _table.export_csv(table_id, columns=["name"], max_rows=2)

        self.assertEqual(stats["count"], 3)
        self.assertEqual(stats["sum"], 6.0)
        self.assertEqual(exported["rowCount"], 2)
        self.assertTrue(exported["truncated"])
        self.assertEqual(exported["csv"].splitlines()[0], "name")

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_comm_message_accepts_ipykernel_dict_shape(self):
        df = pd.DataFrame({"name": ["a", "b"], "score": [1, 2]})
        component = ui.table(df, source="df", show_index=False)
        table_id = component.props["tableId"]

        data = _table._comm_message_data(
            {
                "content": {
                    "data": {
                        "requestId": "request-1",
                        "action": "fetch",
                        "tableId": table_id,
                        "offset": 0,
                        "limit": 1,
                    }
                }
            }
        )
        response = _table._handle_request(data)

        self.assertEqual(data["requestId"], "request-1")
        self.assertEqual(response["totalRows"], 2)
        self.assertEqual(len(response["rows"]), 1)

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_unregistered_table_errors_are_action_specific(self):
        with self.assertRaises(KeyError) as fetch_error:
            _table.get_table_window("missing-table", action="fetch")
        self.assertIn("sort, filter, search", str(fetch_error.exception))
        self.assertNotIn("missing-table", str(fetch_error.exception))

        with self.assertRaises(KeyError) as export_error:
            _table.export_csv("missing-table", action="export_csv")
        self.assertIn("export", str(export_error.exception).lower())

        with self.assertRaises(KeyError) as stats_error:
            _table.column_stats("missing-table", "score", action="stats")
        self.assertIn("column statistics", str(stats_error.exception).lower())

    @unittest.skipIf(pd is None, "pandas is required for ui.table tests")
    def test_table_requires_source_and_pandas_dataframe(self):
        df = pd.DataFrame({"a": [1]})

        with self.assertRaises(ValueError):
            ui.table(df, source="")
        with self.assertRaises(TypeError):
            ui.table([{"a": 1}], source="df")


if __name__ == "__main__":
    unittest.main()
