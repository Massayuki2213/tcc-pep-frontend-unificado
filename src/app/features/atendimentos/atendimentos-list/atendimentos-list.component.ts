import { Component, OnInit, signal } from '@angular/core';
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

  constructor(private svc: AtendimentosService) {}

  ngOnInit() {
    this.svc.listar().subscribe({
      next: data => { this.atendimentos.set(data); this.carregando.set(false); },
      error: ()   => this.carregando.set(false),
    });
  }

  riscoLabel(valor: string) {
    return RISCO_MANCHESTER_OPTIONS.find(r => r.value === valor)?.label ?? valor;
  }
}
