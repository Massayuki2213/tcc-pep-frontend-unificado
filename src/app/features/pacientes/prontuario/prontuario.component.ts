import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PacientesService } from '../pacientes.service';

@Component({
  selector: 'app-prontuario',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './prontuario.component.html',
})
export class ProntuarioComponent implements OnInit {
  data = signal<any>(null);
  erro = signal(false);

  constructor(
    private pacientesSvc: PacientesService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.erro.set(false);
    const id = this.route.snapshot.params['id'];
    // historico-completo retorna { paciente, historicoClinico, atendimentos }
    this.pacientesSvc.historicoCompleto(id).subscribe({
      next: (p: any) => {
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
