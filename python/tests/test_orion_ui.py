import unittest
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
        self.assertIn("df.query", window["expression"])
        self.assertIn(".sort_values('score', ascending=False)", window["expression"])

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
    def test_table_requires_source_and_pandas_dataframe(self):
        df = pd.DataFrame({"a": [1]})

        with self.assertRaises(ValueError):
            ui.table(df, source="")
        with self.assertRaises(TypeError):
            ui.table([{"a": 1}], source="df")


if __name__ == "__main__":
    unittest.main()
