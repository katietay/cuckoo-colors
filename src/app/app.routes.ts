import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent 
  },
  {
    path: 'color-coordinate',
    loadComponent: () =>
      import('./color-coordinate.component').then(m => m.ColorCoordinateComponent)
  },
  {
    path: 'color-management',
    loadComponent: () =>
      import('./color-management/color-management.component').then(m => m.ColorManagementComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
