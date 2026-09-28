import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { errorMessage, time } from '../core/format';
import { DriverRouteDto, OrderDto, OrderWriteDto, PaymentMethod, RestaurantDto } from '../core/models';

/**
 * Unos porudzbine kad lokal pozove, ili izmena postojece. Polja su poredjana kako dispecer
 * pita na telefonu: lokal, broj porudzbine u lokalu, kupac, adresa, novac, kad je gotovo.
 */
@Component({
  selector: 'app-order-form',
  imports: [FormsModule],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <section class="modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>{{ order() ? 'Izmena porudzbine #' + order()!.id : 'Nova porudzbina' }}</h2>
          <button type="button" class="link" (click)="closed.emit()">zatvori</button>
        </header>

        <form class="form-grid" (ngSubmit)="save()">
          <label class="field span-2">
            <span>Lokal *</span>
            <select name="restaurant" [(ngModel)]="restaurantId" (ngModelChange)="onRestaurantChange()" required>
              <option [ngValue]="null" disabled>Izaberi lokal</option>
              @for (restaurant of restaurants(); track restaurant.id) {
                <option [ngValue]="restaurant.id">{{ restaurant.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Broj u lokalu</span>
            <input name="ref" [(ngModel)]="restaurantOrderRef" placeholder="npr. 42" />
          </label>
          <label class="field">
            <span>{{ order() ? 'Nova spremnost (min od sada)' : 'Spremno za (min)' }}</span>
            <input name="ready" type="number" min="0" max="240" [(ngModel)]="readyInMinutes"
              [placeholder]="order() ? 'sada: ' + formatTime(order()!.readyAt) : ''" />
          </label>

          <label class="field">
            <span>Telefon kupca *</span>
            <input name="phone" type="tel" [(ngModel)]="customerPhone" required />
          </label>
          <label class="field">
            <span>Ime kupca</span>
            <input name="customer" [(ngModel)]="customerName" />
          </label>

          <label class="field span-2">
            <span>Adresa dostave *</span>
            <div class="input-row">
              <input name="address" [(ngModel)]="deliveryAddress" (ngModelChange)="clearCoordinates()"
                placeholder="Ulica i broj, grad" required />
              <button type="button" class="button secondary" (click)="locate()" [disabled]="locating()">
                {{ locating() ? 'Trazim...' : 'Nadji na mapi' }}
              </button>
            </div>
            <small [class.warn]="latitude == null">
              @if (latitude != null) {
                Koordinate: {{ latitude.toFixed(5) }}, {{ longitude!.toFixed(5) }}
                @if (foundAs()) { <span class="muted">({{ foundAs() }})</span> }
              } @else {
                Bez koordinata: predlozi ce procenjivati grubo.
              }
            </small>
          </label>

          <label class="field">
            <span>Placanje</span>
            <select name="payment" [(ngModel)]="paymentMethod">
              <option value="CASH">Gotovina</option>
              <option value="CARD">Kartica</option>
              <option value="PREPAID">Placeno unapred</option>
            </select>
          </label>
          <label class="field">
            <span>Iznos za naplatu (din)</span>
            <input name="amount" type="number" min="0" step="10" [(ngModel)]="amountToCollect"
              [disabled]="paymentMethod === 'PREPAID'" />
          </label>

          <label class="field span-2">
            <span>Napomena za vozaca</span>
            <textarea name="note" rows="2" [(ngModel)]="note" placeholder="Sprat, interfon, kusur..."></textarea>
          </label>

          @if (!order()) {
            <label class="field span-2">
              <span>Vozac</span>
              <select name="driver" [(ngModel)]="driverId">
                <option [ngValue]="null">Bez vozaca (dodeli kasnije, uz predlog)</option>
                @for (driver of drivers(); track driver.driverId) {
                  <option [ngValue]="driver.driverId">
                    {{ driver.driverName }}{{ driver.onShift ? '' : ' (van smene)' }} - {{ driver.stops.length }} stanica
                  </option>
                }
              </select>
              <small class="muted">Sa izabranim vozacem porudzbina ide na najbolje mesto u njegovoj ruti.</small>
            </label>
          }

          @if (error()) {
            <p class="alert error span-2">{{ error() }}</p>
          }

          <footer class="modal-actions span-2">
            <button type="button" class="button ghost" (click)="closed.emit()">Odustani</button>
            <button type="submit" class="button primary" [disabled]="saving()">
              {{ saving() ? 'Cuvam...' : order() ? 'Sacuvaj izmene' : 'Napravi porudzbinu' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  `,
})
export class OrderFormComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly order = input<OrderDto | null>(null);
  readonly restaurants = input.required<RestaurantDto[]>();
  readonly drivers = input<DriverRouteDto[]>([]);
  readonly saved = output<OrderDto>();
  readonly closed = output<void>();

  readonly saving = signal(false);
  readonly locating = signal(false);
  readonly error = signal('');
  readonly foundAs = signal('');

  restaurantId: number | null = null;
  restaurantOrderRef = '';
  customerName = '';
  customerPhone = '';
  deliveryAddress = '';
  latitude: number | null = null;
  longitude: number | null = null;
  paymentMethod: PaymentMethod = 'CASH';
  amountToCollect: number | null = null;
  readyInMinutes: number | null = null;
  note = '';
  driverId: number | null = null;

  readonly formatTime = time;

  ngOnInit(): void {
    const existing = this.order();
    if (existing) {
      this.restaurantId = existing.restaurantId;
      this.restaurantOrderRef = existing.restaurantOrderRef ?? '';
      this.customerName = existing.customerName ?? '';
      this.customerPhone = existing.customerPhone;
      this.deliveryAddress = existing.deliveryAddress;
      this.latitude = existing.deliveryLatitude;
      this.longitude = existing.deliveryLongitude;
      this.paymentMethod = existing.paymentMethod;
      this.amountToCollect = existing.amountToCollect;
      this.note = existing.note ?? '';
    } else if (this.restaurants().length === 1) {
      this.restaurantId = this.restaurants()[0].id;
      this.onRestaurantChange();
    }
  }

  onRestaurantChange(): void {
    if (this.order()) return;
    const restaurant = this.restaurants().find((item) => item.id === this.restaurantId);
    if (restaurant) this.readyInMinutes = restaurant.defaultPrepMinutes;
  }

  clearCoordinates(): void {
    this.latitude = null;
    this.longitude = null;
    this.foundAs.set('');
  }

  async locate(): Promise<void> {
    if (!this.deliveryAddress.trim()) {
      this.error.set('Prvo upisi adresu.');
      return;
    }
    this.locating.set(true);
    this.error.set('');
    try {
      const result = await this.api.geocode(this.deliveryAddress);
      if (!result) {
        this.error.set('Adresa nije nadjena na mapi. Dodaj grad ili proveri naziv ulice.');
        return;
      }
      this.latitude = result.latitude;
      this.longitude = result.longitude;
      this.foundAs.set(result.displayName.split(',').slice(0, 3).join(','));
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Pretraga adrese nije uspela.'));
    } finally {
      this.locating.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.restaurantId == null || !this.customerPhone.trim() || !this.deliveryAddress.trim()) {
      this.error.set('Lokal, telefon kupca i adresa su obavezni.');
      return;
    }
    const body: OrderWriteDto = {
      restaurantId: this.restaurantId,
      restaurantOrderRef: this.restaurantOrderRef.trim() || null,
      customerName: this.customerName.trim() || null,
      customerPhone: this.customerPhone.trim(),
      deliveryAddress: this.deliveryAddress.trim(),
      deliveryLatitude: this.latitude,
      deliveryLongitude: this.longitude,
      note: this.note.trim() || null,
      paymentMethod: this.paymentMethod,
      amountToCollect: this.paymentMethod === 'PREPAID' ? 0 : Number(this.amountToCollect ?? 0),
      readyInMinutes: this.readyInMinutes == null || `${this.readyInMinutes}` === '' ? null : Number(this.readyInMinutes),
    };

    this.saving.set(true);
    this.error.set('');
    try {
      const existing = this.order();
      const result = existing
        ? await this.api.updateOrder(existing.id, body)
        : await this.api.createOrder({ ...body, driverId: this.driverId, placement: 'BEST' });
      this.saved.emit(result);
    } catch (error: unknown) {
      this.error.set(errorMessage(error, 'Cuvanje nije uspelo.'));
    } finally {
      this.saving.set(false);
    }
  }
}
