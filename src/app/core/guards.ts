import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const dispatcherGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isDispatcher ? true : inject(Router).createUrlTree([auth.homeUrl]);
};

export const driverGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isDriver ? true : inject(Router).createUrlTree([auth.homeUrl]);
};

/** Prijavljen korisnik ne vidi login, vec ide na svoju stranu. */
export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.snapshot ? inject(Router).createUrlTree([auth.homeUrl]) : true;
};
