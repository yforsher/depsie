import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only auto-cleans when afterEach is global; Vitest globals are off.
afterEach(cleanup);

// jsdom does not implement the dialog methods; toggling `open` is all the tests rely on.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

// TanStack Router scrolls the window to the top after each navigation, and jsdom logs "Not
// implemented" for every call; no test reads the scroll position.
window.scrollTo = () => {};
