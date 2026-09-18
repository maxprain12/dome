import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { extensionI18n, initializeI18n } from "../../src/lib/i18n";
import Sidebar from "../../src/ui/Sidebar";
initializeI18n().then(() =>
  createRoot(document.getElementById("root")!).render(
    <I18nextProvider i18n={extensionI18n}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </I18nextProvider>,
  ),
);
