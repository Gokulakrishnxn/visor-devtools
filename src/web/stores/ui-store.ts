import { create } from "zustand";

/** View state shared across a design: palette, edit mode, drawers. */
type UiState = {
  paletteOpen: boolean;
  editing: boolean;
  /** Deny pressed once: the steering box is open. */
  denying: boolean;
  inspectorOpen: boolean;
  setPalette: (open: boolean) => void;
  setEditing: (editing: boolean) => void;
  setDenying: (denying: boolean) => void;
  setInspector: (open: boolean) => void;
};

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  editing: false,
  denying: false,
  inspectorOpen: false,
  setPalette: (paletteOpen) => set({ paletteOpen }),
  setEditing: (editing) => set({ editing, denying: false }),
  setDenying: (denying) => set({ denying, editing: false }),
  setInspector: (inspectorOpen) => set({ inspectorOpen }),
}));
