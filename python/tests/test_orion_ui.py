import unittest

import orion_ui as ui
from orion_ui import _runtime


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


if __name__ == "__main__":
    unittest.main()
