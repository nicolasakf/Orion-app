# Notebook Plotly Regression Checklist

Use this checklist after changes to notebook output rendering, Plotly MIME handling, or notebook output container layout.

## Prerequisites
- Open `public/test-files/plotly_test.ipynb` in Orion.
- Ensure the notebook has at least one multi-trace line plot and one pie chart output.
- Test in both light and dark themes.

## Core Interaction Checks
- Legend single-click hides and shows traces without shrinking the plot frame.
- Legend double-click isolates a single trace and restore-all behavior still works.
- Repeated legend toggles do not move the chart into a tiny viewport.
- Hover labels stay anchored near points/slices and do not jump to page corners.
- Plot remains readable after notebook scroll, cell focus changes, and theme switch.

## Modebar / Popover Checks
- Modebar remains within the notebook output area (not pinned to far page edges).
- Modebar dropdowns (for example image export or hover/zoom controls) open near the chart.
- Modebar controls remain clickable after legend interactions.

## Layout and Collapse Checks
- With normal output view, chart fills available cell width and keeps expected height.
- When cell output collapse is toggled on, Plotly output is not forced into `max-h-48` clipping.
- Mixed-output cells (text + Plotly) still render text outputs normally while Plotly stays stable.
- Returning to an offscreen plot (scroll away then back) does not trigger chart collapse.

## Pass Criteria
- No tiny-chart collapse after interactive legend operations.
- No detached Plotly UI controls appearing outside notebook output context.
- No console/runtime errors during render, resize, or interaction.
