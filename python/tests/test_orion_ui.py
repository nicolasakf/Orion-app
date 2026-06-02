import unittest
from types import ModuleType
from unittest.mock import patch

import orion_ui as ui
from orion_ui import _runtime


class PlotlyTemplateRegistry(dict):
    """Dict-like stand-in for Plotly's template registry."""


class OrionUiTests(unittest.TestCase):
    def setUp(self):
        _runtime._STATE.clear()
        _runtime._OUTPUT_STATE.clear()

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
        self.assertEqual(stack_children[3]["type"], "Progress")
        self.assertEqual(stack_children[4]["type"], "Alert")
        self.assertEqual(stack_children[5]["type"], "Avatar")
        self.assertEqual(stack_children[6]["type"], "Popover")
        self.assertEqual(stack_children[7]["type"], "Carousel")
        self.assertEqual(stack_children[8]["type"], "Collapsible")
        self.assertEqual(stack_children[9]["type"], "Accordion")
        self.assertEqual(payload["state"]["mode"], "fast")
        self.assertEqual(payload["state"]["view"], "chart")
        self.assertEqual(payload["state"]["start_date"], "2026-05-26")
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


if __name__ == "__main__":
    unittest.main()
