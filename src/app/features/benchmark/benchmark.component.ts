import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription, interval, startWith, switchMap, catchError, of } from 'rxjs';
import { DatePipe } from '@angular/common';
import { BenchmarkService, BenchmarkStatus, ResultadoCsv } from './benchmark.service';
import { ToastService } from '../../core/toast.service';
import { environment } from '../../../environments/environment';

interface DashboardOption {
  uid: string;
  nome: string;
}

@Component({
  selector: 'app-benchmark',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './benchmark.component.html',
})
export class BenchmarkComponent implements OnInit, OnDestroy {
  online = signal(false);
  status = signal<BenchmarkStatus | null>(null);
  resultados = signal<ResultadoCsv[]>([]);

  script = signal('cenario-emergencia');
  carga = signal('1');

  // Fallback exibido enquanto o orquestrador está offline; a fonte da verdade
  // é GET /scenarios, que sobrescreve estes valores no ngOnInit.
  scripts = signal<string[]>(['cenario-emergencia', 'cenario-mono-ms']);
  cargas = signal<{ valor: string; nome: string }[]>([
    { valor: '1', nome: 'Normal (50 VUs)' },
    { valor: '2', nome: 'Dia Corrido (150 VUs)' },
    { valor: '3', nome: 'Emergência (300 VUs)' },
  ]);

  dashboards: DashboardOption[] = [
    { uid: 'tcc-pep-normal', nome: 'Cenário 1 — Normal' },
    { uid: 'tcc-pep-dia-corrido', nome: 'Cenário 2 — Dia Corrido' },
    { uid: 'tcc-pep-emergencia', nome: 'Cenário 3 — Emergência' },
    { uid: 'tcc-pep-mono-ms-compara', nome: 'Comparativo Mono × MS' },
    { uid: 'tcc-pep-monolito', nome: 'Monolito — Visão Geral' },
  ];
  dashboardUid = signal(this.dashboards[0].uid);

  grafanaSrc = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(
      `${environment.grafanaUrl}/d/${this.dashboardUid()}?kiosk&refresh=5s&from=now-15m&to=now`,
    ),
  );

  private poll?: Subscription;

  private svc       = inject(BenchmarkService);
  private toast     = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  ngOnInit() {
    this.poll = interval(2000)
      .pipe(
        startWith(0),
        switchMap(() => this.svc.status().pipe(catchError(() => of(null)))),
      )
      .subscribe(st => {
        // Orquestrador acabou de ficar online → busca cenários atualizados
        if (st !== null && !this.online()) this.carregarCenarios();
        this.online.set(st !== null);
        if (st) {
          // Rodada acabou de terminar → lista de CSVs ganhou um arquivo novo
          if (this.status()?.running && !st.running) this.carregarResultados();
          this.status.set(st);
        }
      });

    this.carregarResultados();
  }

  carregarCenarios() {
    this.svc.scenarios().subscribe({
      next: sc => {
        if (sc.scripts?.length) {
          this.scripts.set(sc.scripts);
          if (!sc.scripts.includes(this.script())) this.script.set(sc.scripts[0]);
        }
        if (sc.cargas?.length) {
          this.cargas.set(sc.cargas);
          if (!sc.cargas.some(c => c.valor === this.carga())) this.carga.set(sc.cargas[0].valor);
        }
      },
      // Orquestrador offline é estado esperado — mantém o fallback hardcoded
      error: () => {},
    });
  }

  carregarResultados() {
    this.svc.results().subscribe({
      next: r => this.resultados.set(r),
      error: () => this.resultados.set([]),
    });
  }

  downloadUrl(rel: string) {
    return this.svc.downloadUrl(rel);
  }

  formatarTamanho(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  }

  ngOnDestroy() {
    this.poll?.unsubscribe();
  }

  iniciar() {
    this.svc.run(this.script(), this.carga()).subscribe({
      next: () => this.toast.success('Teste iniciado. Acompanhe o log e o dashboard.'),
      error: err => this.toast.error(err.message),
    });
  }

  parar() {
    this.svc.stop().subscribe({
      next: () => this.toast.info('Parada solicitada.'),
      error: err => this.toast.error(err.message),
    });
  }

  onScriptChange(e: Event) {
    this.script.set((e.target as HTMLSelectElement).value);
  }

  onCargaChange(e: Event) {
    this.carga.set((e.target as HTMLSelectElement).value);
  }

  onDashboardChange(e: Event) {
    this.dashboardUid.set((e.target as HTMLSelectElement).value);
  }
}
