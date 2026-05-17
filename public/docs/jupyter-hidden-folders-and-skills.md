# Fix: Jupyter cannot read workspace skills in hidden folders

Use this guide when you connect **Orion to a Jupyter server** and workspace skills under dot-directories (for example `.orion/skills/.../SKILL.md`) do not appear or fail to load. Jupyter Server’s contents API hides dot-prefixed paths by default, which can make those files return **404** or omit them from listings.

Orion discovers skills under **`.agents/skills`** and **`.orion/skills`** (relative to the notebook workspace root, plus user-level `.agents`/`.orion` at the server root). Those paths are hidden folders, so they are affected the same way until the server allows hidden paths.

## When you need this

- Skills you added under `.orion/skills` or `.agents/skills` never show up in Orion, or loading them fails.
- Your notebook root is something like `research/`, and paths such as `research/.orion/skills/...` should work but the server behaves as if the files are missing.

## Fix: allow hidden files in Jupyter Server

1. **Open or create** the Jupyter Server config file.

   **macOS / Linux (POSIX)**  
   Default path: `~/.jupyter/jupyter_server_config.py`

   **Windows**  
   Default path: `%USERPROFILE%\.jupyter\jupyter_server_config.py`  
   In PowerShell you can open the folder with:

   ```powershell
   explorer "$env:USERPROFILE\.jupyter"
   ```

   If the file does not exist, generate a template (same command on macOS, Linux, and Windows when `jupyter` is on your `PATH`):

   ```bash
   jupyter server --generate-config
   ```

   The command prints the path it wrote (usually under `~/.jupyter/` or `%USERPROFILE%\.jupyter\`).

2. **Add** this line (or uncomment and set it if the file already contains it):

   ```python
   c.FileContentsManager.allow_hidden = True
   ```

   This is the supported setting for Jupyter Server’s default file contents manager: it **allows listing and reading hidden files and directories** through the API Orion uses.

3. **Restart** the Jupyter Server so the change applies, then reconnect from Orion if needed.

### Older Notebook classic server (6.x)

If you run the **classic** `jupyter notebook` stack instead of `jupyter server`, use `jupyter_notebook_config.py` in the same Jupyter config directory (`~/.jupyter/` or `%USERPROFILE%\.jupyter\`) and set the same trait if your version exposes it. Current JupyterLab and `jupyter server` use `jupyter_server_config.py`.

## Notes

- Without this setting, dot-prefixed paths can return **404** or be skipped in directory listings; enabling hidden access addresses that for all hidden paths the server serves, not only Orion skills.
- If your organization restricts Jupyter configuration, ask whoever runs the server to set `allow_hidden` (or an equivalent supported by your deployment).

## Related

- GitHub issue: [Jupyter cannot read dotfiles or dot-directories by default](https://github.com/nicolasakf/Orion/issues/182)

---

*Last updated April 2026.*
