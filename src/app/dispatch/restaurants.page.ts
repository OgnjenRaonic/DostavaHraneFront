import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { errorMessage } from '../core/format';
import { RestaurantDto, RestaurantWriteDto } from '../core/models';
import { UiService } from '../core/ui.service';

type RestaurantForm = {
  id: number | null;
  name: string;
  address: string;
  phone: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  defaultPrepMinutes: number;
  active: boolean;
};

const EMPTY_FORM: RestaurantForm = {
  id: null,
  name: '',
  address: '',
  phone: '',
  latitude: null,
  longitude: null,
  note: '',
  defaultPrepMinutes: 15,
  active: true,
};

@Component({
  selector: 'app-restaurants-page',
  imports: [FormsModule],
  template: `
    <section class="page two-col">
      <div class="panel">
        <div class="panel-head">
          <h2>Partnerski lokali</h2>
          <button type="button" class="button primary small" (click)="edit(null)">+ Novi lokal</button>
        </div>
        <table class="table">
          <thead>
            <tr><th>Lokal</th><th>Adresa</th><th>Telefon</th><th>Priprema</th><th>Mapa</th><th></th></tr>
          </thead>
          <tbody>
            @for (restaurant of restaurants(); track restaurant.id) {
              <tr [class.inactive]="!restaurant.active" [class.selected]="form.id === restaurant.id">
                <td><strong>{{ restaurant.name }}</strong>@if (!restaurant.active) { <span class="flag">neaktivan</span> }</td>
                <td>{{ restaurant.address }}</td>
                <td>{{ restaurant.phone || '-' }}</td>
                <td>{{ restaurant.defaultPrepMinutes }} min</td>
                <td>@if (restaurant.latitude != null) { da } @else { <span class="text-warn">nema</span> }</td>
                <td class="actions"><button type="button" class="button small ghost" (click)="edit(restaurant)">Izmeni</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty small">Jos nema lokala.</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (open()) {
        <form class="panel form-grid" (ngSubmit)="save()">
          <h2 class="span-2">{{ form.id ? 'Izmena lokala' : 'Novi lokal' }}</h2>
          <label class="field span-2"><span>Naziv *</span><input name="name" [(ngModel)]="form.name" required /></label>
          <label class="field span-2">
            <span>Adresa *</span>
            <div class="input-row">
              <input name="address" [(ngModel)]="form.address" required placeholder="Ulica i broj, grad" />
              <button type="button" class="button secondary" (click)="locate()" [disabled]="locating()">
                {{ locating() ? 'Trazim...' : 'Nadji na mapi' }}
              </button>
            </div>
            <small [class.warn]="form.latitude == null">
              @if (form.latitude != null) { Koordinate: {{ form.latitude }}, {{ form.longitude }} }
              @else { Bez koordinata predlozi vozaca su grubi. }
            </small>
          </label>
          <label class="field"><span>Telefon</span><input name="phone" [(ngModel)]="form.phone" /></label>
          <label class="field">
            <span>Uobicajena priprema (min)</span>
            <input name="prep" type="number" min="0" max="240" [(ngModel)]="form.defaultPrepMinutes" />
          </label>
          <label class="field"><span>Sirina</span><input name="lat" type="number" step="any" [(ngModel)]="form.latitude" /></label>
          <label class="field"><span>Duzina</span><input name="lng" type="number" step="any" [(ngModel)]="form.longitude" /></label>
          <label class="field span-2"><span>Napomena za vozace</span><textarea name="note" rows="2" [(ngModel)]="form.note" placeholder="Ulaz sa zadnje strane..."></textarea></label>
          <label class="check span-2"><input type="checkbox" name="active" [(ngModel)]="form.active" /> Aktivan (moze se birati pri unosu)</label>
          @if (error()) { <p class="alert error span-2">{{ error() }}</p> }
          <footer class="modal-actions span-2">
            <button type="button" class="button ghost" (click)="open.set(false)">Zatvori</button>
            <button type="submit" class="button primary" [disabled]="ui.busy()">Sacuvaj</button>
          </footer>
        </form>
      }
    </section>
  `,
})
export class RestaurantsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly ui = inject(UiService);

  readonly restaurants = signal<RestaurantDto[]>([]);
  readonly open = signal(false);
  readonly locating = signal(false);
  readonly error = signal('');
  form: RestaurantForm = { ...EMPTY_FORM };

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    await this.ui.run(async () => this.restaurants.set(await this.api.restaurants(true)), 'Lokali nisu ucitani.');
  }

  edit(restaurant: RestaurantDto | null): void {
    this.error.set('');
    this.form = restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          phone: restaurant.phone ?? '',
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          note: restaurant.note ?? '',
          defaultPrepMinutes: restaurant.defaultPrepMinutes,
          active: restaurant.active,
        }
      : { ...EMPTY_FORM };
    this.open.set(true);
  }

  async locate(): Promise<void> {
    this.locating.set(true);
    this.error.set('');
    try {
      const result = await this.api.geocode(this.form.address);
      if (!result) {
        this.error.set('Adresa nije nadjena. Dodaj grad ili upisi koordinate rucno.');
        return;
      }
      this.form.latitude = Number(result.latitude.toFixed(6));
      this.form.longitude = Number(result.longitude.toFixed(6));
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Pretraga adrese nije uspela.'));
    } finally {
      this.locating.set(false);
    }
  }

  async save(): Promise<void> {
    const body: RestaurantWriteDto = {
      name: this.form.name.trim(),
      address: this.form.address.trim(),
      phone: this.form.phone.trim() || null,
      latitude: this.toNumber(this.form.latitude),
      longitude: this.toNumber(this.form.longitude),
      note: this.form.note.trim() || null,
      defaultPrepMinutes: Math.max(0, Math.trunc(Number(this.form.defaultPrepMinutes) || 0)),
      active: this.form.active,
    };
    if (!body.name || !body.address) {
      this.error.set('Naziv i adresa su obavezni.');
      return;
    }
    const id = this.form.id;
    const ok = await this.ui.run(async () => {
      if (id) await this.api.updateRestaurant(id, body);
      else await this.api.createRestaurant(body);
    }, 'Lokal nije sacuvan.');
    if (ok) {
      this.open.set(false);
      this.ui.showNotice(`Lokal ${body.name} je sacuvan.`);
      await this.load();
    }
  }

  private toNumber(value: number | null | string): number | null {
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
