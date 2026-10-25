import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ColorCoordinateComponent } from './color-coordinate.component';
import { Color } from './services/colors.service';

const COLORS: Color[] = [
  { id: 1, name: 'red', hex: '#ff0000' },
  { id: 2, name: 'orange', hex: '#ffa500' },
  { id: 3, name: 'yellow', hex: '#ffff00' },
  { id: 4, name: 'green', hex: '#008000' },
];

describe('ColorCoordinateComponent', () => {
  let fixture: ComponentFixture<ColorCoordinateComponent>;
  let component: ColorCoordinateComponent;
  let http: HttpTestingController;

  function generate(rows: number, columns: number, colors: number): void {
    component.colorForm.setValue({ rows, columns, colors });
    component.onSubmit();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorCoordinateComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ColorCoordinateComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('api/colors').flush(COLORS);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('loads colors and limits the color count to what exists', () => {
    expect(component.colors.length).toBe(4);
    component.colorForm.setValue({ rows: 2, columns: 2, colors: 5 });
    expect(component.colorForm.valid).toBeFalse();
    component.colorForm.setValue({ rows: 2, columns: 2, colors: 4 });
    expect(component.colorForm.valid).toBeTrue();
  });

  it('shows an error message if colors cannot be loaded', () => {
    const second = TestBed.createComponent(ColorCoordinateComponent);
    second.detectChanges();
    http.expectOne('api/colors').flush('x', { status: 500, statusText: 'Server Error' });
    expect(second.componentInstance.loadError).toContain('Could not load');
  });

  it('validates row, column and color limits', () => {
    const f = component.colorForm;
    f.setValue({ rows: 0, columns: 1, colors: 1 });
    expect(f.valid).toBeFalse();
    f.setValue({ rows: 1001, columns: 1, colors: 1 });
    expect(f.valid).toBeFalse();
    f.setValue({ rows: 1, columns: 703, colors: 1 });
    expect(f.valid).toBeFalse();
    f.setValue({ rows: 1000, columns: 702, colors: 1 });
    expect(f.valid).toBeTrue();
  });

  it('does nothing when the form is invalid', () => {
    component.onSubmit();
    expect(component.colorRows.length).toBe(0);
  });

  it('makes spreadsheet-style column labels', () => {
    expect(component.makeColumns(3)).toEqual(['A', 'B', 'C']);
    const labels = component.makeColumns(702);
    expect(labels[25]).toBe('Z');
    expect(labels[26]).toBe('AA');
    expect(labels[27]).toBe('AB');
    expect(labels[701]).toBe('ZZ');
  });

  it('builds the requested grid with the first color selected', () => {
    generate(3, 4, 2);
    expect(component.rowLabels).toEqual([1, 2, 3]);
    expect(component.columnLabels).toEqual(['A', 'B', 'C', 'D']);
    expect(component.colorRows.map((r) => r.color.name)).toEqual(['red', 'orange']);
    expect(component.colorRows.map((r) => r.selected)).toEqual([true, false]);
    expect(component.getCellColor().name).toBe('red');
  });

  it('paints a cell with the selected color and lists it in Table 1', () => {
    generate(2, 2, 2);
    component.onCellClick(1, 'A');
    expect(component.cellColor(1, 'A')).toBe('#ff0000');
    expect(component.cellColor(2, 'B')).toBeNull();
    expect(component.rowCells[0]).toEqual(['A1']);

    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('#cell-A1')!;
    expect(cell.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(cell.getAttribute('aria-label')).toBe('A1, red');
  });

  it('repainting a cell moves it between colors', () => {
    generate(2, 2, 2);
    component.onCellClick(1, 'A');
    component.onSelectRow(1);
    component.onCellClick(1, 'A');
    expect(component.cellColor(1, 'A')).toBe('#ffa500');
    expect(component.rowCells[0]).toEqual([]);
    expect(component.rowCells[1]).toEqual(['A1']);
  });

  it('lists painted cells in natural order', () => {
    generate(12, 2, 1);
    for (const r of [10, 2, 1]) component.onCellClick(r, 'A');
    component.onCellClick(1, 'B');
    expect(component.rowCells[0]).toEqual(['A1', 'A2', 'A10', 'B1']);
  });

  it('changing a row color recolors the cells it already painted', () => {
    generate(2, 2, 2);
    component.onSelectRow(1);
    component.onCellClick(1, 'B');
    expect(component.cellColor(1, 'B')).toBe('#ffa500');

    component.onColorChange(1, COLORS[3]);
    expect(component.cellColor(1, 'B')).toBe('#008000');
    expect(component.rowCells[1]).toEqual(['B1']);
  });

  it('only offers colors that other rows are not using', () => {
    generate(1, 1, 3);
    const names = component.getAvailableColorsForRow(0).map((c) => c.name);
    expect(names).toEqual(['red', 'green']);
  });

  it('generating again clears all painted cells', () => {
    generate(2, 2, 2);
    component.onCellClick(1, 'A');
    component.onSelectRow(1);
    component.onCellClick(2, 'B');

    generate(2, 2, 2);
    expect(component.cellColor(1, 'A')).toBeNull();
    expect(component.rowCells).toEqual([[], []]);
    expect(component.colorRows[0].selected).toBeTrue();
  });

  it('ignores clicks when no color row is selected', () => {
    generate(1, 1, 1);
    component.colorRows[0].selected = false;
    component.onCellClick(1, 'A');
    expect(component.cellColor(1, 'A')).toBeNull();
  });

  it('findColor throws for an unknown name', () => {
    expect(component.findColor('red').id).toBe(1);
    expect(() => component.findColor('nope')).toThrowError(/not found/);
  });

  describe('keyboard support', () => {
    function press(key: string, row: number, col: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      component.onCellKeydown(event, row, col);
      return event;
    }

    beforeEach(() => generate(3, 3, 2));

    it('Enter and Space paint the focused cell', () => {
      expect(press('Enter', 1, 'A').defaultPrevented).toBeTrue();
      press(' ', 2, 'B');
      expect(component.cellColor(1, 'A')).toBe('#ff0000');
      expect(component.cellColor(2, 'B')).toBe('#ff0000');
    });

    it('arrow keys move focus and update the roving tabindex, staying inside the grid', () => {
      fixture.detectChanges();
      press('ArrowRight', 1, 'A');
      expect(component.activeCell).toEqual({ row: 1, col: 1 });
      press('ArrowDown', 1, 'B');
      expect(component.activeCell).toEqual({ row: 2, col: 1 });
      press('ArrowLeft', 2, 'A');
      expect(component.activeCell).toEqual({ row: 2, col: 0 });
      press('ArrowUp', 1, 'A');
      expect(component.activeCell).toEqual({ row: 1, col: 0 });
      press('End', 1, 'A');
      expect(component.activeCell.col).toBe(2);
      press('ArrowRight', 3, 'C');
      expect(component.activeCell.col).toBe(2);
    });

    it('leaves other keys alone', () => {
      expect(press('Tab', 1, 'A').defaultPrevented).toBeFalse();
    });

    it('exactly one cell is in the tab order', () => {
      fixture.detectChanges();
      const cells = (fixture.nativeElement as HTMLElement).querySelectorAll('td.paint-cell');
      const tabbable = Array.from(cells).filter((c) => c.getAttribute('tabindex') === '0');
      expect(cells.length).toBe(9);
      expect(tabbable.length).toBe(1);
    });
  });

  it('the Print button does not submit the form', () => {
    generate(1, 1, 1);
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.print-button')!;
    expect(button.type).toBe('button');
  });

  it('onPrint shows every color row while printing, then restores the view', () => {
    jasmine.clock().install();
    const printSpy = spyOn(window, 'print');
    try {
      component.onPrint();
      expect(component.printMode).toBeTrue();
      jasmine.clock().tick(150);
      expect(printSpy).toHaveBeenCalledTimes(1);
      expect(component.printMode).toBeFalse();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('labels every form control', () => {
    const el = fixture.nativeElement as HTMLElement;
    for (const id of ['rows-input', 'columns-input', 'colors-input']) {
      expect(el.querySelector(`label[for="${id}"]`)).withContext(id).not.toBeNull();
      expect(el.querySelector(`#${id}`)).withContext(id).not.toBeNull();
    }
  });
});
