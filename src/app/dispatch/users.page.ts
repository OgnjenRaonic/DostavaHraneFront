import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { dateTime } from '../core/format';
import { Role, UserDto } from '../core/models';
import { UiService } from '../core/ui.service';

type UserForm = {
  id: number | null;
  username: string;
  name: string;
  phoneNumber: string;
  password: string;
  role: Role;
  active: boolean;
};

@Component({
  selector: 'app-users-page',
  imports: [FormsModule],
  template: `
    <section class="page two-col">
      <div class="panel">
        <div class="panel-head">
          <h2>Vozaci</h2>
          <button type="button" class="button primary small" (click)="edit(null, 'DRIVER')">+ Novi vozac</button>
        </div>
        <table class="table">
          <thead><tr><th>Ime</th><th>Prijava</th><th>Telefon</th><th>Smena</th><th>Lokacija</th><th></th></tr></thead>
          <tbody>
            @for (user of drivers(); track user.id) {
              <tr [class.inactive]="!user.active" [class.selected]="form.id === user.id">
                <td><strong>{{ user.name }}</strong>@if (!user.active) { <span class="flag">neaktivan</span> }</td>
                <td>{{ user.username }}</td>
                <td>{{ user.phoneNumber || '-' }}</td>
                <td>@if (user.onShift) { <span class="flag ok">u smeni</span> } @else { - }</td>
                <td class="muted">{{ user.lastLocationAt ? dateTime(user.lastLocationAt) : '-' }}</td>
                <td class="actions"><button type="button" class="button small ghost" (click)="edit(user, user.role)">Izmeni</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty small">Jos nema vozaca.</td></tr>
            }
          </tbody>
        </table>

        <div class="panel-head spaced">
          <h2>Dispeceri</h2>
          <button type="button" class="button ghost small" (click)="edit(null, 'DISPATCHER')">+ Novi dispecer</button>
        </div>
        <table class="table">
          <thead><tr><th>Ime</th><th>Prijava</th><th>Telefon</th><th></th></tr></thead>
          <tbody>
            @for (user of dispatchers(); track user.id) {
              <tr [class.inactive]="!user.active" [class.selected]="form.id === user.id">
                <td><strong>{{ user.name }}</strong>@if (!user.active) { <span class="flag">neaktivan</span> }</td>
                <td>{{ user.username }}</td>
                <td>{{ user.phoneNumber || '-' }}</td>
                <td class="actions"><button type="button" class="button small ghost" (click)="edit(user, user.role)">Izmeni</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (open()) {
        <form class="panel form-grid" (ngSubmit)="save()">
          <h2 class="span-2">
            {{ form.id ? 'Izmena naloga' : form.role === 'DRIVER' ? 'Novi vozac' : 'Novi dispecer' }}
          </h2>
          <label class="field span-2"><span>Ime i prezime *</span><input name="name" [(ngModel)]="form.name" required /></label>
          <label class="field">
            <span>Korisnicko ime *</span>
            <input name="username" [(ngModel)]="form.username" [disabled]="!!form.id" autocomplete="off" />
          </label>
          <label class="field"><span>Telefon</span><input name="phone" type="tel" [(ngModel)]="form.phoneNumber" /></label>
          <label class="field span-2">
            <span>{{ form.id ? 'Nova lozinka (prazno = bez promene)' : 'Lozinka * (bar 6 znakova)' }}</span>
            <input name="password" type="text" [(ngModel)]="form.password" autocomplete="new-password" />
            @if (form.id) { <small class="muted">Nova lozinka odjavljuje nalog sa svih uredjaja.</small> }
          </label>
          @if (form.id) {
            <label class="check span-2"><input type="checkbox" name="active" [(ngModel)]="form.active" /> Aktivan nalog</label>
          }
          <footer class="modal-actions span-2">
            <button type="button" class="button ghost" (click)="open.set(false)">Zatvori</button>
            <button type="submit" class="button primary" [disabled]="ui.busy()">Sacuvaj</button>
          </footer>
        </form>
      }
    </section>
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly ui = inject(UiService);

  readonly users = signal<UserDto[]>([]);
  readonly drivers = computed(() => this.users().filter((user) => user.role === 'DRIVER'));
  readonly dispatchers = computed(() => this.users().filter((user) => user.role === 'DISPATCHER'));
  readonly open = signal(false);
  readonly dateTime = dateTime;

  form: UserForm = this.emptyForm('DRIVER');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    await this.ui.run(async () => this.users.set(await this.api.users()), 'Nalozi nisu ucitani.');
  }

  edit(user: UserDto | null, role: Role): void {
    this.form = user
      ? {
          id: user.id,
          username: user.username,
          name: user.name,
          phoneNumber: user.phoneNumber ?? '',
          password: '',
          role: user.role,
          active: user.active,
        }
      : this.emptyForm(role);
    this.open.set(true);
  }

  async save(): Promise<void> {
    const form = this.form;
    if (!form.name.trim() || (!form.id && (!form.username.trim() || form.password.length < 6))) {
      this.ui.showError('Ime, korisnicko ime i lozinka (bar 6 znakova) su obavezni.');
      return;
    }
    const ok = await this.ui.run(async () => {
      if (form.id) {
        await this.api.updateUser(form.id, {
          name: form.name.trim(),
          phoneNumber: form.phoneNumber.trim() || null,
          password: form.password || null,
          active: form.active,
        });
      } else {
        await this.api.createUser({
          username: form.username.trim(),
          name: form.name.trim(),
          phoneNumber: form.phoneNumber.trim() || null,
          password: form.password,
          role: form.role,
        });
      }
    }, 'Nalog nije sacuvan.');
    if (ok) {
      this.open.set(false);
      this.ui.showNotice(`Nalog ${form.name} je sacuvan.`);
      await this.load();
    }
  }

  private emptyForm(role: Role): UserForm {
    return { id: null, username: '', name: '', phoneNumber: '', password: '', role, active: true };
  }
}
