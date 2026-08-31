// Setup Vitest global.
//
// PENTING (sebelum import @testing-library/react di file test):
// matikan auto-cleanup afterEach bawaan testing-library. Uji store-context
// memount StoreProvider SEKALI (beforeAll) dan dipakai lintas test — auto-
// cleanup akan meng-unmount pohon itu setelah test pertama.
process.env.RTL_SKIP_AUTO_CLEANUP = "true";

import "@testing-library/jest-dom/vitest";