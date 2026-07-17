import { Component, OnInit, signal, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PacientesService } from '../pacientes.service';
import { Paciente } from '../../../models/paciente.model';
import { Atendimento } from '../../../models/atendimento.model';
import { HistoricoClinico } from '../../../models/historico-clinico.model';

type ProntuarioView = Paciente & {
  historicoClinico: HistoricoClinico | null;
  atendimentos: Atendimento[];
};

@Component({
  selector: 'app-prontuario',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './prontuario.component.html',
})
export class ProntuarioComponent implements OnInit {
  data = signal<ProntuarioView | null>(null);
  erro = signal(false);

  private pacientesSvc = inject(PacientesService);
  private route        = inject(ActivatedRoute);

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.erro.set(false);
    const id = this.route.snapshot.params['id'];
    this.pacientesSvc.historicoCompleto(id).subscribe({
      next: p => {
        this.data.set({
          ...p.paciente,
          historicoClinico: p.historicoClinico,
          atendimentos: p.atendimentos,
        });
      },
      error: () => this.erro.set(true),
    });
  }
}
