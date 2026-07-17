import { Component, OnInit, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AtendimentosService } from '../atendimentos.service';
import { Atendimento, RISCO_MANCHESTER_OPTIONS } from '../../../models/atendimento.model';

@Component({
  selector: 'app-atendimentos-list',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './atendimentos-list.component.html',
})
export class AtendimentosListComponent implements OnInit {
  atendimentos = signal<Atendimento[]>([]);
  carregando   = signal(true);
  erro         = signal(false);

  private svc = inject(AtendimentosService);

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.carregando.set(true);
    this.erro.set(false);
    this.svc.listar().subscribe({
      next: data => { this.atendimentos.set(data); this.carregando.set(false); },
      error: ()   => { this.erro.set(true); this.carregando.set(false); },
    });
  }

  riscoLabel(valor: string) {
    return RISCO_MANCHESTER_OPTIONS.find(r => r.value === valor)?.label ?? valor;
  }
}
