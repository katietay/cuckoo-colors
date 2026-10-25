import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  const toggle = () => el.querySelector<HTMLButtonElement>('.hamburger')!;

  it('creates the app with a skip link, main navigation and three links', () => {
    expect(component).toBeTruthy();
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Main navigation');
    expect(el.querySelectorAll('nav a').length).toBe(3);
  });

  it('uses a single navigation landmark', () => {
    expect(el.querySelector('[role="navigation"]')).toBeNull();
    expect(el.querySelectorAll('nav').length).toBe(1);
  });

  it('toggles the drawer and reflects it in aria-expanded', () => {
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    toggle().click();
    fixture.detectChanges();
    expect(component.drawerOpen).toBeTrue();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('nav')?.classList).toContain('open');
  });

  it('closes the drawer on Escape', () => {
    component.toggleDrawer();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.drawerOpen).toBeFalse();
  });

  it('closes the drawer when clicking outside it, but not when clicking inside', () => {
    component.toggleDrawer();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('nav')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.drawerOpen).toBeTrue();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.drawerOpen).toBeFalse();
  });

  it('closes the drawer after choosing a link', () => {
    component.toggleDrawer();
    fixture.detectChanges();
    el.querySelector<HTMLAnchorElement>('nav a')!.click();
    expect(component.drawerOpen).toBeFalse();
  });
});
