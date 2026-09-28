import { Routes } from '@angular/router';
import { dispatcherGuard, driverGuard, loginGuard } from './core/guards';
import { LoginComponent } from './login.component';
import { DispatchShellComponent } from './dispatch/dispatch-shell.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [loginGuard] },
  {
    path: 'dispecer',
    component: DispatchShellComponent,
    canActivate: [dispatcherGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tabla' },
      { path: 'tabla', loadComponent: () => import('./dispatch/board.page').then((m) => m.BoardPage), data: { title: 'Tabla' } },
      { path: 'istorija', loadComponent: () => import('./dispatch/history.page').then((m) => m.HistoryPage), data: { title: 'Istorija i izvestaj' } },
      { path: 'lokali', loadComponent: () => import('./dispatch/restaurants.page').then((m) => m.RestaurantsPage), data: { title: 'Lokali' } },
      { path: 'nalozi', loadComponent: () => import('./dispatch/users.page').then((m) => m.UsersPage), data: { title: 'Vozaci i dispeceri' } },
      { path: '**', redirectTo: 'tabla' },
    ],
  },
  {
    path: 'vozac',
    canActivate: [driverGuard],
    loadComponent: () => import('./driver/driver.page').then((m) => m.DriverPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
