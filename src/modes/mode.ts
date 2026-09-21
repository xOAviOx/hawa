/** Common interface for the three play modes. */
export interface Mode {
  /** Called once when the mode becomes active. */
  enter(): void;
  /** Called every render frame while active. */
  update(): void;
  /** Called when switching away — must silence any sounding notes. */
  exit(): void;
  dispose(): void;
}
