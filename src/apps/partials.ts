// Register the shared Handlebars partials used by the config windows.
//
// Four windows render the same provider block, help list, and prompt field. Foundry's loadTemplates()
// accepts a { partialName: path } map, so the markup stays in one .hbs file per partial instead of
// being copy-pasted into each window's template (where they would silently drift out of sync with
// provider-ui.ts's expectations).

import { MODULE_ID, log } from "../constants";

const PARTIALS: Record<string, string> = {
  noodlrHelp: `modules/${MODULE_ID}/templates/partials/help.hbs`,
  noodlrProviderBlock: `modules/${MODULE_ID}/templates/partials/provider-block.hbs`,
  noodlrPromptField: `modules/${MODULE_ID}/templates/partials/prompt-field.hbs`,
  noodlrImageBlock: `modules/${MODULE_ID}/templates/partials/image-block.hbs`,
};

/**
 * Load + register the partials. Await this during `init`, before any config window can render —
 * Handlebars throws on a missing partial, which would take the whole window down.
 *
 * The v13+ home is `foundry.applications.handlebars.loadTemplates`; the bare global still exists as a
 * deprecated shim, so we prefer the namespaced one and fall back rather than assume either.
 */
export async function registerNoodlrPartials(): Promise<void> {
  const loader =
    (foundry as any)?.applications?.handlebars?.loadTemplates ??
    (globalThis as any)?.loadTemplates ??
    null;
  if (typeof loader !== "function") {
    log("could not find loadTemplates; config windows may fail to render");
    return;
  }
  try {
    await loader(PARTIALS);
  } catch (err) {
    log("failed to load shared templates:", err);
  }
}
