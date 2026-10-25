import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  drawerOpen = false;

  @ViewChild('navMenu') navMenuRef!: ElementRef<HTMLElement>;

  toggleDrawer(): void {
    this.drawerOpen = !this.drawerOpen;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.navMenuRef || !this.drawerOpen) return;

    const target = event.target as HTMLElement;
    const clickedInside = this.navMenuRef.nativeElement.contains(target);
    const clickedToggle = target.closest('.hamburger');

    if (!clickedInside && !clickedToggle) {
      this.closeDrawer();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeDrawer();
  }
}
