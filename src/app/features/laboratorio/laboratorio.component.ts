import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Subscription, interval, startWith, switchMap, catchError, of } from 'rxjs';
import { Arquitetura, Carga, LaboratorioService, MetricasRodada, Observacao } from './laboratorio.service';
import { BenchmarkService, ResultadoCsv } from '../benchmark/benchmark.service';
import { ToastService } from '../../core/toast.service';

/** Métricas-resposta candidatas. O report 4 pede latência e vazão. */
const METRICAS: { chave: keyof MetricasRodada; nome: string; unidade: string }[] = [
  { chave: 'avg_ms', nome: 'Latência média', unidade: 'ms' },
  { chave: 'med_ms', nome: 'Latência mediana', unidade: 'ms' },
  { chave: 'p95_ms', nome: 'Latência p95', unidade: 'ms' },
  { chave: 'p99_ms', nome: 'Latência p99', unidade: 'ms' },
  { chave: 'rps', nome: 'Vazão (throughput)', unidade: 'req/s' },
  { chave: 'error_rate_pct', nome: 'Taxa de erro', unidade: '%' },
  { chave: 'slo_pass_pct', nome: 'Cumprimento de SLO', unidade: '%' },
];

const ARQUITETURAS: { valor: Arquitetura; nome: string }[] = [
  { valor: 'monolito', nome: 'Monolito' },
  { valor: 'microsservicos', nome: 'Microsserviços' },
];

const CARGAS: { valor: Carga; nome: string }[] = [
  { valor: 'normal', nome: 'Normal' },
  { valor: 'dia-corrido', nome: 'Dia Corrido' },
  { valor: 'emergencia', nome: 'Emergência' },
];

/** Abaixo disto não há erro amostral confiável; 5 é o alvo confortável. */
const MIN_REPLICATAS = 3;
const IDEAL_REPLICATAS = 5;

interface Celula {
  arquitetura: Arquitetura;
  carga: Carga;
  n: number;
  media: number | null;
  desvio: number | null;
  estado: 'vazia' | 'insuficiente' | 'minima' | 'boa';
}

interface Prontidao {
  nome: string;
  pronto: boolean;
  detalhe: string;
}

@Component({
  selector: 'app-laboratorio',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './laboratorio.component.html',
})
export class LaboratorioComponent implements OnInit, OnDestroy {
  metricas = METRICAS;
  arquiteturas = ARQUITETURAS;
  cargas = CARGAS;
  minReplicatas = MIN_REPLICATAS;
  idealReplicatas = IDEAL_REPLICATAS;

  online = signal(false);
  observacoes = signal<Observacao[]>([]);
  disponiveis = signal<ResultadoCsv[]>([]);
  metrica = signal<keyof MetricasRodada>('avg_ms');

  // Entrada manual de rodadas geradas fora deste orquestrador
  csvColado = signal('');
  novaArquitetura = signal<'' | Arquitetura>('');
  novaCarga = signal<'' | Carga>('');
  novaNota = signal('');

  private poll?: Subscription;
  private svc = inject(LaboratorioService);
  private benchmark = inject(BenchmarkService);
  private toast = inject(ToastService);

  metricaAtual = computed(() => METRICAS.find(m => m.chave === this.metrica())!);

  /**
   * CSVs em /results que ainda não entraram no acervo.
   *
   * Compara por `rel` E por nome de arquivo: o formato do `rel` ganhou o prefixo
   * da stack quando o orquestrador virou multi-stack, e as observações guardadas
   * antes disso trazem o `rel` no formato antigo. O nome do arquivo é estável
   * nos dois mundos — o k6 embute system_type, cenário e timestamp nele.
   */
  naoImportados = computed(() => {
    const rels = new Set(this.observacoes().map(o => o.origemRel).filter(Boolean));
    const nomes = new Set(this.observacoes().map(o => o.arquivo));
    return this.disponiveis().filter(r => !rels.has(r.rel) && !nomes.has(r.arquivo));
  });

  /** A matriz do delineamento: 2 arquiteturas × 3 cargas. */
  matriz = computed<Celula[]>(() => {
    const obs = this.observacoes();
    const chave = this.metrica();
    const out: Celula[] = [];

    for (const a of ARQUITETURAS) {
      for (const c of CARGAS) {
        const valores = obs
          .filter(o => o.arquitetura === a.valor && o.carga === c.valor)
          .map(o => o.metricas?.[chave])
          .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

        out.push({
          arquitetura: a.valor,
          carga: c.valor,
          n: valores.length,
          media: this.media(valores),
          desvio: this.desvioPadrao(valores),
          estado: this.estadoDaCelula(valores.length),
        });
      }
    }
    return out;
  });

  total = computed(() => this.observacoes().length);

  /** Quais análises o acervo já sustenta — e o que falta para as demais. */
  prontidao = computed<Prontidao[]>(() => {
    const m = this.matriz();
    const em = (a: Arquitetura, c: Carga) => m.find(x => x.arquitetura === a && x.carga === c)!.n;

    // Teste t: mono × MS sob carga fixa, uma comparação por nível de carga
    const cargasProntas = CARGAS.filter(
      c => em('monolito', c.valor) >= MIN_REPLICATAS && em('microsservicos', c.valor) >= MIN_REPLICATAS,
    );
    const cargasParciais = CARGAS.filter(
      c => em('monolito', c.valor) > 0 && em('microsservicos', c.valor) > 0 && !cargasProntas.includes(c),
    );

    // ANOVA de dois fatores: todas as 6 células precisam de replicata
    const vazias = m.filter(c => c.n === 0);
    const fracas = m.filter(c => c.n > 0 && c.n < MIN_REPLICATAS);
    const anovaPronta = vazias.length === 0 && fracas.length === 0;
    const nMin = Math.min(...m.map(c => c.n));
    const nMax = Math.max(...m.map(c => c.n));

    return [
      {
        nome: 'Teste t de Student',
        pronto: cargasProntas.length > 0,
        detalhe: cargasProntas.length > 0
          ? `Comparável em: ${cargasProntas.map(c => c.nome).join(', ')}.` +
            (cargasParciais.length > 0
              ? ` Faltam replicatas em: ${cargasParciais.map(c => c.nome).join(', ')}.`
              : '')
          : 'Exige as duas arquiteturas na mesma carga, com ' +
            `${MIN_REPLICATAS}+ rodadas de cada. Nenhuma carga atende ainda.`,
      },
      {
        nome: 'ANOVA de dois fatores',
        pronto: anovaPronta,
        detalhe: anovaPronta
          ? `As 6 células têm ${nMin}+ rodadas.` +
            (nMin === nMax ? ' Delineamento balanceado.' : ` Desbalanceado (${nMin} a ${nMax}).`)
          : vazias.length > 0
            ? `${vazias.length} de 6 células ainda estão vazias.`
            : `${fracas.length} célula(s) abaixo de ${MIN_REPLICATAS} rodadas.`,
      },
      {
        nome: 'Tukey HSD (post-hoc)',
        pronto: anovaPronta,
        detalhe: anovaPronta
          ? 'Disponível — roda depois da ANOVA, se ela acusar significância.'
          : 'Depende da ANOVA estar completa.',
      },
    ];
  });

  ngOnInit() {
    // O orquestrador é opcional: se estiver fora, a tela mostra o estado e não insiste
    this.poll = interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => this.svc.observacoes().pipe(catchError(() => of(null)))),
      )
      .subscribe(obs => {
        const ficouOnline = obs !== null && !this.online();
        this.online.set(obs !== null);
        if (obs) this.observacoes.set(obs);
        if (ficouOnline) this.carregarDisponiveis();
      });
  }

  ngOnDestroy() {
    this.poll?.unsubscribe();
  }

  carregarDisponiveis() {
    this.benchmark.results().subscribe({
      next: r => this.disponiveis.set(r),
      error: () => this.disponiveis.set([]),
    });
  }

  recarregar() {
    this.svc.observacoes().subscribe({
      next: o => this.observacoes.set(o),
      error: () => {},
    });
    this.carregarDisponiveis();
  }

  importar(rel: string) {
    this.svc.importar(rel).subscribe({
      next: o => {
        this.toast.success(`Rodada guardada: ${o.arquitetura} / ${o.carga}.`);
        this.recarregar();
      },
      error: err => this.toast.error(err.message),
    });
  }

  importarTodas() {
    const pendentes = this.naoImportados();
    if (pendentes.length === 0) return;
    // Sequencial de propósito: o índice é um único JSON, gravado a cada inserção
    const proxima = (i: number) => {
      if (i >= pendentes.length) {
        this.toast.success(`${pendentes.length} rodada(s) guardada(s).`);
        return this.recarregar();
      }
      this.svc.importar(pendentes[i].rel).subscribe({
        next: () => proxima(i + 1),
        error: () => proxima(i + 1),
      });
    };
    proxima(0);
  }

  adicionarColado() {
    const csv = this.csvColado().trim();
    if (!csv) return this.toast.error('Cole o conteúdo do CSV primeiro.');

    this.svc.adicionar(
      csv,
      'colado.csv',
      this.novaArquitetura() || undefined,
      this.novaCarga() || undefined,
      this.novaNota() || undefined,
    ).subscribe({
      next: o => {
        this.toast.success(`Rodada guardada: ${o.arquitetura} / ${o.carga}.`);
        this.csvColado.set('');
        this.novaNota.set('');
        this.recarregar();
      },
      error: err => this.toast.error(err.message),
    });
  }

  async carregarArquivo(e: Event) {
    const input = e.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    const texto = await arquivo.text();

    this.svc.adicionar(
      texto,
      arquivo.name,
      this.novaArquitetura() || undefined,
      this.novaCarga() || undefined,
      this.novaNota() || undefined,
    ).subscribe({
      next: o => {
        this.toast.success(`${arquivo.name} guardado: ${o.arquitetura} / ${o.carga}.`);
        this.recarregar();
      },
      error: err => this.toast.error(err.message),
    });
    input.value = '';
  }

  reclassificar(obs: Observacao, campo: 'arquitetura' | 'carga', e: Event) {
    const valor = (e.target as HTMLSelectElement).value;
    this.svc.atualizar(obs.id, { [campo]: valor } as never).subscribe({
      next: () => this.recarregar(),
      error: err => {
        this.toast.error(err.message);
        this.recarregar();
      },
    });
  }

  anotar(obs: Observacao, e: Event) {
    const nota = (e.target as HTMLInputElement).value;
    if (nota === obs.nota) return;
    this.svc.atualizar(obs.id, { nota }).subscribe({
      next: () => this.recarregar(),
      error: err => this.toast.error(err.message),
    });
  }

  remover(obs: Observacao) {
    if (!confirm(`Remover a rodada ${obs.arquivo} do acervo? O CSV guardado será apagado.`)) return;
    this.svc.remover(obs.id).subscribe({
      next: () => {
        this.toast.info('Rodada removida do acervo.');
        this.recarregar();
      },
      error: err => this.toast.error(err.message),
    });
  }

  async copiarDataset() {
    try {
      const resp = await fetch(this.svc.datasetUrl());
      await navigator.clipboard.writeText(await resp.text());
      this.toast.success('Dataset copiado — cole na análise.');
    } catch {
      this.toast.error('Não consegui copiar. Use o botão de download.');
    }
  }

  valorDaMetrica(obs: Observacao): number | null {
    return obs.metricas?.[this.metrica()] ?? null;
  }

  celula(a: Arquitetura, c: Carga): Celula {
    return this.matriz().find(x => x.arquitetura === a && x.carga === c)!;
  }

  nomeCarga(valor: string) {
    return CARGAS.find(c => c.valor === valor)?.nome ?? valor;
  }

  nomeArquitetura(valor: string) {
    return ARQUITETURAS.find(a => a.valor === valor)?.nome ?? valor;
  }

  datasetUrl() {
    return this.svc.datasetUrl();
  }

  csvUrl(id: string) {
    return this.svc.csvUrl(id);
  }

  onMetricaChange(e: Event) {
    this.metrica.set((e.target as HTMLSelectElement).value as keyof MetricasRodada);
  }

  onArquiteturaChange(e: Event) {
    this.novaArquitetura.set((e.target as HTMLSelectElement).value as '' | Arquitetura);
  }

  onCargaChange(e: Event) {
    this.novaCarga.set((e.target as HTMLSelectElement).value as '' | Carga);
  }

  onCsvChange(e: Event) {
    this.csvColado.set((e.target as HTMLTextAreaElement).value);
  }

  onNotaChange(e: Event) {
    this.novaNota.set((e.target as HTMLInputElement).value);
  }

  private media(valores: number[]): number | null {
    if (valores.length === 0) return null;
    return valores.reduce((s, v) => s + v, 0) / valores.length;
  }

  /** Desvio padrão amostral (n-1) — indefinido com uma única rodada. */
  private desvioPadrao(valores: number[]): number | null {
    if (valores.length < 2) return null;
    const m = this.media(valores)!;
    const soma = valores.reduce((s, v) => s + (v - m) ** 2, 0);
    return Math.sqrt(soma / (valores.length - 1));
  }

  private estadoDaCelula(n: number): Celula['estado'] {
    if (n === 0) return 'vazia';
    if (n < MIN_REPLICATAS) return 'insuficiente';
    if (n < IDEAL_REPLICATAS) return 'minima';
    return 'boa';
  }
}
