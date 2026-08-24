import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription, interval, startWith, switchMap, catchError, of } from 'rxjs';
import { DatePipe } from '@angular/common';
import { BenchmarkService, BenchmarkStatus, ResultadoCsv, StackInfo } from './benchmark.service';
import { ToastService } from '../../core/toast.service';
import { environment } from '../../../environments/environment';

interface DashboardOption {
  uid: string;
  nome: string;
  /** Em qual Grafana este painel mora — cada stack tem o seu. */
  stack: 'monolito' | 'microsservicos';
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

  stack = signal('monolito');
  script = signal('cenario-emergencia');
  carga = signal('1');

  // Fallback exibido enquanto o orquestrador está offline; a fonte da verdade
  // é GET /scenarios, que sobrescreve estes valores no ngOnInit.
  stacks = signal<StackInfo[]>([
    { valor: 'monolito', nome: 'Monolito', dir: '', disponivel: true, scripts: ['cenario-emergencia', 'cenario-mono-ms'] },
    { valor: 'microsservicos', nome: 'Microsserviços', dir: '', disponivel: true, scripts: ['cenario-emergencia-ms'] },
  ]);
  cargas = signal<{ valor: string; nome: string }[]>([
    { valor: '1', nome: 'Normal (50 VUs)' },
    { valor: '2', nome: 'Dia Corrido (150 VUs)' },
    { valor: '3', nome: 'Emergência (300 VUs)' },
  ]);

  stackAtual = computed(() => this.stacks().find(s => s.valor === this.stack()));

  /** Cada stack tem seus próprios scripts — trocar de stack troca a lista. */
  scripts = computed(() => this.stackAtual()?.scripts ?? []);

  dashboards: DashboardOption[] = [
    { uid: 'tcc-pep-normal', nome: 'Cenário 1 — Normal', stack: 'monolito' },
    { uid: 'tcc-pep-dia-corrido', nome: 'Cenário 2 — Dia Corrido', stack: 'monolito' },
    { uid: 'tcc-pep-emergencia', nome: 'Cenário 3 — Emergência', stack: 'monolito' },
    { uid: 'tcc-pep-mono-ms', nome: 'Comparativo Mono × MS', stack: 'monolito' },
    { uid: 'tcc-pep-monolito', nome: 'Monolito — Visão Geral', stack: 'monolito' },
    { uid: 'tcc-pep-ms-normal', nome: 'Cenário 1 — Normal', stack: 'microsservicos' },
    { uid: 'tcc-pep-ms-dia-corrido', nome: 'Cenário 2 — Dia Corrido', stack: 'microsservicos' },
    { uid: 'tcc-pep-ms-emergencia', nome: 'Cenário 3 — Emergência', stack: 'microsservicos' },
    { uid: 'tcc-pep-comparativo', nome: 'Comparativo MS × Monolito', stack: 'microsservicos' },
  ];
  dashboardUid = signal(this.dashboards[0].uid);

  dashboardsMonolito = computed(() => this.dashboards.filter(d => d.stack === 'monolito'));
  dashboardsMs = computed(() => this.dashboards.filter(d => d.stack === 'microsservicos'));

  dashboardAtual = computed(() => this.dashboards.find(d => d.uid === this.dashboardUid()));

  grafanaSrc = computed<SafeResourceUrl>(() => {
    const painel = this.dashboardAtual();
    const base = painel?.stack === 'microsservicos' ? environment.grafanaMsUrl : environment.grafanaUrl;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `${base}/d/${this.dashboardUid()}?kiosk&refresh=5s&from=now-15m&to=now`,
    );
  });

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
        if (sc.stacks?.length) {
          this.stacks.set(sc.stacks);
          if (!sc.stacks.some(s => s.valor === this.stack())) this.stack.set(sc.stacks[0].valor);
          this.ajustarScript();
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

  /** Mantém o script selecionado válido para a stack atual. */
  private ajustarScript() {
    const disponiveis = this.scripts();
    if (disponiveis.length && !disponiveis.includes(this.script())) {
      this.script.set(disponiveis[0]);
    }
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
    this.svc.run(this.stack(), this.script(), this.carga()).subscribe({
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

  onStackChange(e: Event) {
    this.stack.set((e.target as HTMLSelectElement).value);
    this.ajustarScript();
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
