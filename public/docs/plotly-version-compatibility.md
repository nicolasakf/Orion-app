# Use a specific Plotly version in notebook outputs

Use this guide when a Plotly chart in Orion does not match what you see in another notebook tool, or when your Python environment uses a newer or older Plotly feature than Orion's built-in chart renderer supports.

Orion renders normal Plotly notebook output with its own bundled `plotly.js`. Your Python `plotly` package still creates the figure data, but it does not automatically change the JavaScript version Orion uses to draw the chart.

## When you need this

- A Plotly chart appears blank, incomplete, or different in Orion but works in JupyterLab, VS Code, or a browser export.
- Your notebook depends on a Plotly feature from a specific `plotly` / `plotly.js` version.
- You need a chart to render with a pinned Plotly JavaScript file, such as one hosted by Plotly's CDN or your organization.

## Steps

1. First, try the normal Plotly output:

   ```python
   fig.show()
   ```

   This is the most reliable option when your chart works with Orion's bundled Plotly renderer.

2. If the chart needs a specific Plotly JavaScript version, display Plotly HTML instead of the default Plotly JSON output:

   ```python
   from IPython.display import display

   html = fig.to_html(
       include_plotlyjs="https://cdn.plot.ly/plotly-2.35.2.min.js",
       full_html=False,
   )

   display({"text/vnd.plotly.v1+html": html}, raw=True)
   ```

   Replace the URL with the Plotly JavaScript version you want to use. Use only URLs you trust.

3. Re-run the cell in Orion.

4. If your workspace blocks external scripts or network access, use one of these alternatives:

   - Ask your organization to allow the trusted Plotly JavaScript URL.
   - Host the approved Plotly JavaScript file on an internal URL and use that URL in `include_plotlyjs`.
   - Export a static image when interactivity is not required.

## Notes

- Installing a different Python `plotly` version changes the figure data produced by Python. It does not, by itself, change Orion's bundled `plotly.js` renderer.
- HTML output can run JavaScript. Only load Plotly JavaScript from sources you trust.
- Results may differ across machines if a notebook depends on a script URL that is unavailable, blocked, or later changed.

---

*Last updated April 2026.*
