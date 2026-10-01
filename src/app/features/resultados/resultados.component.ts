import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Analise, ResultadosService } from './resultados.service';

/**
 * Métricas que fazem sentido como variável-resposta do experimento — as quatro
 * famílias que o trabalho se propõe a medir: tempo de resposta, vazão, taxa de
 * erro e consumo de recursos.
 *
 * As de hardware não vêm do CSV do k6: são lidas do Prometheus na janela da
 * rodada. Só existem em observações coletadas depois que essa captura entrou,
 * então no acervo antigo aparecem vazias — e a tela diz isso em vez de fingir.
 */
const METRICAS = [
  { chave: 'avg_ms', nome: 'Latência média', log: true, grupo: 'Tempo de resposta' },
  { chave: 'p95_ms', nome: 'Latência p95', log: true, grupo: 'Tempo de resposta' },
  { chave: 'med_ms', nome: 'Latência mediana', log: true, grupo: 'Tempo de resposta' },
  { chave: 'rps', nome: 'Vazão', log: false, grupo: 'Vazão' },
  { chave: 'error_rate_pct', nome: 'Taxa de erro', log: false, grupo: 'Estabilidade' },
  { chave: 'cpu_cores_avg', nome: 'CPU média (cores)', log: false, grupo: 'Consumo de recursos' },
  { chave: 'cpu_cores_max', nome: 'CPU de pico (cores)', log: false, grupo: 'Consumo de recursos' },
  { chave: 'mem_mb_avg', nome: 'Memória média (MB)', log: false, grupo: 'Consumo de recursos' },
  { chave: 'mem_mb_max', nome: 'Memória de pico (MB)', log: false, grupo: 'Consumo de recursos' },
];

/** Acima disto a célula variou demais para a média significar muita coisa. */
const CV_ACEITAVEL = 20;

const NOMES_CARGA: Record<string, string> = {
  normal: 'Normal',
  'dia-corrido': 'Dia Corrido',
  emergencia: 'Emergência',
};

@Component({
  selector: 'app-resultados',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './resultados.component.html',
})
export class ResultadosComponent implements OnInit {
  metricas = METRICAS;

  /** O seletor agrupa por família de métrica — são nove opções, não quatro. */
  grupos = [...new Set(METRICAS.map(m => m.grupo))].map(g => ({
    nome: g,
    itens: METRICAS.filter(m => m.grupo === g),
  }));

  metrica = signal('avg_ms');
  // Latência tem variância que cresce com a média; o log a estabiliza e é o
  // padrão para esta análise. Vazão não precisa e vem desligado.
  usarLog = signal(true);

  analise = signal<Analise | null>(null);
  carregando = signal(true);
  offline = signal(false);

  private svc = inject(ResultadosService);

  metricaAtual = computed(() => METRICAS.find(m => m.chave === this.metrica()));
  podeLog = computed(() => this.metricaAtual()?.log ?? false);

  /** Só as comparações que confrontam arquiteturas dentro da mesma carga. */
  paresChave = computed(() => this.analise()?.posthoc?.pares.filter(p => p.mesmaCarga) ?? []);
  paresRestantes = computed(() => this.analise()?.posthoc?.pares.filter(p => !p.mesmaCarga) ?? []);

  descritivasMono = computed(() => this.analise()?.descritivas.filter(d => d.arquitetura === 'monolito') ?? []);
  descritivasMs = computed(() => this.analise()?.descritivas.filter(d => d.arquitetura === 'microsservicos') ?? []);

  /** Maior média entre as células — usada para escalar as barras. */
  maiorMedia = computed(() => {
    const ds = this.analise()?.descritivas ?? [];
    return Math.max(1, ...ds.map(d => d.media ?? 0));
  });

  /**
   * A métrica escolhida não existe em nenhuma observação. É diferente de
   * "acervo incompleto": os dados estão lá, só não têm esta coluna — caso das
   * métricas de hardware em rodadas anteriores à captura do Prometheus.
   */
  metricaSemDados = computed(() => {
    const ds = this.analise()?.descritivas ?? [];
    return ds.length > 0 && ds.every(d => d.media === null);
  });

  /** Células cuja dispersão passou do aceitável para uma medição controlada. */
  celulasInstaveis = computed(() =>
    (this.analise()?.descritivas ?? []).filter(d => (d.cv ?? 0) > CV_ACEITAVEL),
  );

  cvAceitavel = CV_ACEITAVEL;

  /** Menor n entre as células: é ele que limita o poder dos testes. */
  menorN = computed(() => {
    const ds = this.analise()?.descritivas ?? [];
    return ds.length ? Math.min(...ds.map(d => d.n)) : 0;
  });

  /**
   * Os critérios que separam "medimos umas vezes" de "isto é um benchmark".
   * Cada um é uma condição do delineamento que, se falhar, tira o sentido dos
   * p-valores exibidos abaixo — por isso ficam no topo, não no rodapé.
   */
  criterios = computed(() => {
    const a = this.analise();
    if (!a) return [];
    return [
      {
        nome: 'Repetição',
        ok: this.menorN() >= 3,
        valor: `n = ${this.menorN()} por célula`,
        porque: 'Sem repetir a mesma condição não há desvio amostral, e sem desvio não há teste.',
      },
      {
        nome: 'Balanceamento',
        ok: a.balanceado,
        valor: a.balanceado ? 'células iguais' : 'células desiguais',
        porque: 'A ANOVA de dois fatores aqui assume o mesmo n em todas as seis células.',
      },
      {
        nome: 'Hardware único',
        ok: !a.misturaMaquinas,
        valor: a.maquinas?.length ? a.maquinas.join(', ') : '—',
        porque: 'Misturar máquinas sem tratá-las como fator joga a variação entre elas no resíduo.',
      },
      {
        nome: 'Dispersão',
        ok: this.celulasInstaveis().length === 0,
        valor: `${this.celulasInstaveis().length} célula(s) acima de ${CV_ACEITAVEL}% de CV`,
        porque: 'CV alto indica que o ambiente variou entre rodadas, não que a arquitetura variou.',
      },
    ];
  });

  criteriosOk = computed(() => this.criterios().every(c => c.ok));

  /**
   * Pontos do Q-Q em coordenadas de um SVG 240x240.
   *
   * O Q-Q e a forma honesta de mostrar normalidade: cada ponto e um residuo,
   * e quanto mais eles seguem a diagonal, mais a distribuicao se parece com a
   * normal. Desvio sistematico nas pontas e cauda pesada; curvatura e
   * assimetria. Um p-valor sozinho esconderia qual dos dois e o caso.
   */
  qqPontos = computed(() => {
    const qq = this.analise()?.normalidade?.qq ?? [];
    if (qq.length === 0) return [];
    const vals = qq.flatMap(p => [p.teorico, p.observado]);
    const lim = Math.max(1, ...vals.map(Math.abs)) * 1.1;
    const esc = (v: number) => 120 + (v / lim) * 110;
    return qq.map(p => ({ x: esc(p.teorico), y: 240 - esc(p.observado) }));
  });

  /** A diagonal de referencia, nas mesmas coordenadas. */
  qqDiagonal = computed(() => (this.qqPontos().length ? 'M 10,230 L 230,10' : ''));


  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.svc.analisar(this.metrica(), this.podeLog() && this.usarLog()).subscribe({
      next: a => {
        this.analise.set(a);
        this.offline.set(false);
        this.carregando.set(false);
      },
      error: () => {
        this.offline.set(true);
        this.carregando.set(false);
      },
    });
  }

  onMetricaChange(e: Event) {
    this.metrica.set((e.target as HTMLSelectElement).value);
    if (!this.podeLog()) this.usarLog.set(false);
    this.carregar();
  }

  alternarLog() {
    this.usarLog.update(v => !v);
    this.carregar();
  }

  nomeCarga(c: string) {
    return NOMES_CARGA[c] ?? c;
  }

  /** p-valores muito pequenos não devem virar "0,0000". */
  fmtP(p: number): string {
    if (p < 0.0001) return '< 0,0001';
    return p.toFixed(4).replace('.', ',');
  }

  /** Razão 1,505 → "+50,5%". */
  pctRazao(razao: number): string {
    return `${razao >= 1 ? '+' : ''}${((razao - 1) * 100).toFixed(1).replace('.', ',')}%`;
  }

  larguraBarra(media: number | null): string {
    if (media === null) return '0%';
    return `${(media / this.maiorMedia()) * 100}%`;
  }

  datasetUrl() {
    return this.svc.datasetUrl();
  }
}
