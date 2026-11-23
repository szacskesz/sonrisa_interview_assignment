import { Routes } from '@angular/router';
import { requireRole, signInGuard } from './core/role-guard';
import { RouteState } from './route-state';

export const routes: Routes = [
  { path: 'sign-in', title: 'Sign in', canActivate: [signInGuard], loadComponent: () => import('./sign-in/sign-in').then((module) => module.SignIn) },
  {
    path: 'subscriptions', title: 'Subscriptions', canActivate: [requireRole('user')],
    loadComponent: () => import('./subscriptions/subscriptions-page/subscriptions-page').then((module) => module.SubscriptionsPage),
  },
  { path: 'admin/feeds', title: 'RSS feeds', canActivate: [requireRole('admin')], component: RouteState },
  { path: 'admin/deliveries', title: 'Deliveries', canActivate: [requireRole('admin')], component: RouteState },
  { path: 'access-denied', title: 'Access denied', component: RouteState },
  { path: '', pathMatch: 'full', redirectTo: '/sign-in' },
  { path: '**', redirectTo: '/sign-in' },
];
