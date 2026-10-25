import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
  });

  it('has a heading and a real link (not a button inside a link) to the generator', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Cuckoo Colors');
    const link = el.querySelector<HTMLAnchorElement>('a.button-alt')!;
    expect(link.getAttribute('href')).toBe('/color-coordinate');
    expect(link.querySelector('button')).toBeNull();
  });
});
