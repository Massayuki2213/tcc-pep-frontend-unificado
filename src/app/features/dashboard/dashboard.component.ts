import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PacientesService } from '../pacientes/pacientes.service';
import { MedicosService } from '../medicos/medicos.service';
import { AtendimentosService } from '../atendimentos/atendimentos.service';
import { ConsultasLaudosService } from '../consultas-laudos/consultas-laudos.service';
import { Atendimento, RISCO_MANCHESTER_OPTIONS, RiscoManchester } from '../../models/atendimento.model';

interface RiscoBar {
  value: RiscoManchester;
  nome: string;
  count: number;
  pct: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  carregando = signal(true);
  erro = signal(false);
  totalPacientes = signal(0);
  totalMedicosAtivos = signal(0);
  totalConsultas = signal(0);
  atendimentos = signal<Atendimento[]>([]);

  totalAtendimentos = computed(() => this.atendimentos().length);

  distribuicaoRisco = computed<RiscoBar[]>(() => {
    const lista = this.atendimentos();
    const max = Math.max(1, lista.length);
    return RISCO_MANCHESTER_OPTIONS.map(o => {
      const count = lista.filter(a => a.classificacaoRisco === o.value).length;
      return { value: o.value, nome: o.value.charAt(0) + o.value.slice(1).toLowerCase(), count, pct: (count / max) * 100 };
    });
  });

  ultimosAtendimentos = computed(() =>
    [...this.atendimentos()]
      .sort((a, b) => b.dataHoraEntrada.localeCompare(a.dataHoraEntrada))
      .slice(0, 6),
  );

  private pacientesSvc    = inject(PacientesService);
  private medicosSvc      = inject(MedicosService);
  private atendimentosSvc = inject(AtendimentosService);
  private consultasSvc    = inject(ConsultasLaudosService);

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.erro.set(false);
    forkJoin({
      pacientes: this.pacientesSvc.listar(),
      medicos: this.medicosSvc.listarAtivos(),
      atendimentos: this.atendimentosSvc.listar(),
      consultas: this.consultasSvc.listar(),
    }).subscribe({
      next: r => {
        this.totalPacientes.set(r.pacientes.length);
        this.totalMedicosAtivos.set(r.medicos.length);
        this.totalConsultas.set(r.consultas.length);
        this.atendimentos.set(r.atendimentos);
        this.carregando.set(false);
      },
      error: () => { this.erro.set(true); this.carregando.set(false); },
    });
  }

  riscoLabel(r: RiscoManchester) {
    return RISCO_MANCHESTER_OPTIONS.find(o => o.value === r)?.label ?? r;
  }
}
