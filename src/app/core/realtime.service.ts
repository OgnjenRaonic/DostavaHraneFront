import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Client } from '@stomp/stompjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * STOMP veza ka serveru. Poruke ne nose podatke, samo "nesto se promenilo", pa stranica na njih
 * ponovo ucita sta prikazuje. Zbog toga je i prekid veze bezopasan: stranice i dalje povremeno
 * osvezavaju same.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);

  readonly connected = signal(false);
  /** Raste na svako obavestenje; strane ga prate kroz effect() i ponovo ucitaju podatke. */
  readonly tick = signal(0);

  /** Pretplata na teme; vraca funkciju za zatvaranje veze. */
  subscribe(topics: string[]): () => void {
    const client = new Client({
      brokerURL: this.api.webSocketUrl(),
      reconnectDelay: 5000,
      heartbeatIncoming: 20000,
      heartbeatOutgoing: 20000,
      // Token se cita pri svakom (ponovnom) povezivanju, jer ga ApiService osvezava.
      beforeConnect: async () => {
        client.connectHeaders = { Authorization: `Bearer ${this.auth.snapshot?.accessToken ?? ''}` };
      },
      onConnect: () => {
        this.zone.run(() => this.connected.set(true));
        for (const topic of topics) {
          client.subscribe(topic, () => this.zone.run(() => this.tick.update((value) => value + 1)));
        }
      },
      onWebSocketClose: () => this.zone.run(() => this.connected.set(false)),
      onStompError: () => this.zone.run(() => this.connected.set(false)),
    });
    client.activate();
    return () => {
      void client.deactivate();
      this.connected.set(false);
    };
  }
}
