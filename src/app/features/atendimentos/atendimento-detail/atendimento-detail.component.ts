import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AtendimentosService } from '../atendimentos.service';
import { Atendimento, RISCO_MANCHESTER_OPTIONS } from '../../../models/atendimento.model';

@Component({
  selector: 'app-atendimento-detail',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './atendimento-detail.component.html',
})
export class AtendimentoDetailComponent implements OnInit {
  atendimento = signal<Atendimento | null>(null);
  riscoLabel  = signal('');
  erro        = signal(false);

  constructor(
    private svc: AtendimentosService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.carregar();
  }

  carregar() {
    this.erro.set(false);
    const id = this.route.snapshot.params['id'];
    this.svc.buscar(id).subscribe({
      next: a => {
        this.atendimento.set(a);
        const opt = RISCO_MANCHESTER_OPTIONS.find(r => r.value === a.classificacaoRisco);
        this.riscoLabel.set(opt?.label ?? a.classificacaoRisco);
      },
      error: () => this.erro.set(true),
    });
  }
}
