import { Component, OnInit } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Color, ColorService, ServerConfig } from './services/colors.service';
import { AddColorComponent } from './shared/add-color.component';
import { compareCellIds } from './shared/color-utils';

export interface ColorRow {
  selected: boolean;
  color: Color;
}

@Component({
  selector: 'app-color-coordinate',
  standalone: true,
  imports: [TitleCasePipe, FormsModule, ReactiveFormsModule, AddColorComponent],
  templateUrl: './color-coordinate.component.html',
  styleUrls: ['./color-coordinate.component.css'],
})
export class ColorCoordinateComponent implements OnInit {
  colorForm: FormGroup;
  printMode = false;
  loadError = '';
  config: ServerConfig = { editingEnabled: false, minColors: 2, maxColors: 75 };

  colors: Color[] = [];
  colorRows: ColorRow[] = [];
  columnLabels: string[] = [];
  rowLabels: number[] = [];

  /** Which color row (index into colorRows) each painted cell belongs to, keyed by cell id such as "B3". */
  private cellOwner = new Map<string, number>();
  /** Painted cell ids per color row, in natural order. Shown in Table 1. */
  rowCells: string[][] = [];

  /** The painting-table cell that can be reached with Tab (roving tabindex). */
  activeCell = { row: 1, col: 0 };

  constructor(
    private colorService: ColorService,
    private fb: FormBuilder,
  ) {
    this.colorForm = this.fb.group({
      rows: [null, [Validators.required, Validators.min(1), Validators.max(1000)]],
      columns: [null, [Validators.required, Validators.min(1), Validators.max(702)]],
      colors: [null, [Validators.required, Validators.min(1), Validators.max(10)]],
    });
  }

  ngOnInit(): void {
    this.colorService.getConfig().subscribe({
      next: (config) => (this.config = config),
      error: () => (this.config = { ...this.config, editingEnabled: false }),
    });
    this.loadColors();
  }

  /** A color was just added from the form on this page, so it can be used right away. */
  onColorAdded(color: Color): void {
    this.colors = [...this.colors, color];
    this.updateColorsValidator();
  }

  private updateColorsValidator(): void {
    const control = this.colorForm.get('colors');
    control?.setValidators([Validators.required, Validators.min(1), Validators.max(Math.max(this.colors.length, 1))]);
    control?.updateValueAndValidity();
  }

  loadColors(): void {
    this.loadError = '';
    this.colorService.getColors().subscribe({
      next: (colors) => {
        this.colors = colors;
        this.updateColorsValidator();
      },
      error: () => (this.loadError = 'Could not load the color list. Please refresh the page to try again.'),
    });
  }

  getAvailableColorsForRow(currentIndex: number): Color[] {
    const takenByOthers = new Set(
      this.colorRows.filter((_, i) => i !== currentIndex).map((r) => r.color.id),
    );
    return this.colors.filter((c) => !takenByOthers.has(c.id));
  }

  /** Select options are matched by id, so reloaded color objects still match. */
  compareColors = (a: Color | null, b: Color | null): boolean => (a && b ? a.id === b.id : a === b);

  onSubmit(): void {
    if (!this.colorForm.valid || this.colors.length === 0) return;
    const { rows, columns, colors } = this.colorForm.value;

    this.colorRows = [];
    for (let i = 0; i < colors; i++) {
      this.colorRows.push({ selected: i === 0, color: this.colors[i % this.colors.length] });
    }
    // A new grid starts blank, so painted-cell bookkeeping must start blank too.
    this.cellOwner = new Map();
    this.rowCells = this.colorRows.map(() => []);
    this.activeCell = { row: 1, col: 0 };

    this.rowLabels = this.makeRows(rows);
    this.columnLabels = this.makeColumns(columns);
  }

  onSelectRow(index: number): void {
    this.colorRows.forEach((row, i) => (row.selected = i === index));
  }

  /** Change the color a row paints with. Cells already painted by that row change color too. */
  onColorChange(index: number, newColor: Color): void {
    const row = this.colorRows[index];
    if (!row || row.color.id === newColor.id) return;
    const other = this.colorRows.find((r, i) => i !== index && r.color.id === newColor.id);
    if (other) other.color = row.color;
    row.color = newColor;
  }

  findColor(colorName: string): Color {
    const color = this.colors.find((c) => c.name === colorName);
    if (!color) throw new Error(`Color with name "${colorName}" not found.`);
    return color;
  }

  cellId(rowNum: number, colLabel: string): string {
    return `${colLabel}${rowNum}`;
  }

  /** Hex color a cell is painted with, or null when it is blank. */
  cellColor(rowNum: number, colLabel: string): string | null {
    const owner = this.cellOwner.get(this.cellId(rowNum, colLabel));
    return owner === undefined ? null : (this.colorRows[owner]?.color.hex ?? null);
  }

  /** Text alternative for a cell, so color is never the only signal. */
  cellLabel(rowNum: number, colLabel: string): string {
    const owner = this.cellOwner.get(this.cellId(rowNum, colLabel));
    const color = owner === undefined ? null : this.colorRows[owner]?.color.name;
    return `${this.cellId(rowNum, colLabel)}, ${color ?? 'not painted'}`;
  }

  onCellClick(rowNum: number, colLabel: string): void {
    const selectedIndex = this.colorRows.findIndex((r) => r.selected);
    if (selectedIndex === -1) return;

    const id = this.cellId(rowNum, colLabel);
    const previous = this.cellOwner.get(id);
    if (previous === selectedIndex) return;
    if (previous !== undefined) {
      this.rowCells[previous] = this.rowCells[previous].filter((c) => c !== id);
    }
    this.cellOwner.set(id, selectedIndex);
    this.rowCells[selectedIndex] = [...this.rowCells[selectedIndex], id].sort(compareCellIds);
  }

  /** Arrow keys move between cells, Enter or Space paints the focused cell. */
  onCellKeydown(event: KeyboardEvent, rowNum: number, colLabel: string): void {
    const colIndex = this.columnLabels.indexOf(colLabel);
    let row = rowNum;
    let col = colIndex;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.onCellClick(rowNum, colLabel);
        return;
      case 'ArrowRight': col++; break;
      case 'ArrowLeft': col--; break;
      case 'ArrowDown': row++; break;
      case 'ArrowUp': row--; break;
      case 'Home': col = 0; break;
      case 'End': col = this.columnLabels.length - 1; break;
      default: return;
    }
    event.preventDefault();
    row = Math.min(Math.max(row, 1), this.rowLabels.length);
    col = Math.min(Math.max(col, 0), this.columnLabels.length - 1);
    this.activeCell = { row, col };
    document.getElementById(`cell-${this.cellId(row, this.columnLabels[col])}`)?.focus();
  }

  makeColumns(count: number): string[] {
    const colLabels: string[] = [];
    for (let i = 0; i < count; i++) {
      let label = '';
      let n = i;
      do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      colLabels.push(label);
    }
    return colLabels;
  }

  makeRows(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  onPrint(): void {
    this.printMode = true;
    setTimeout(() => {
      window.print();
      this.printMode = false;
    }, 100);
  }

  getCellColor(): Color {
    const selectedRow = this.colorRows.find((row) => row.selected);
    if (!selectedRow) throw new Error('No selected color row');
    return selectedRow.color;
  }
}
