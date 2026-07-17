import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MedicosService } from '../medicos.service';
import { Medico } from '../../../models/medico.model';
import { ToastService } from '../../../core/toast.service';

@Component({
  selector: 'app-medicos-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './medicos-list.component.html',
})
export class MedicosListComponent implements OnInit {
  medicos = signal<Medico[]>([]);
  carregando = signal(true);

  constructor(private svc: MedicosService, private toast: ToastService) {}

  ngOnInit() {
    this.svc.listar().subscribe({
      next: data => { this.medicos.set(data); this.carregando.set(false); },
      error: ()   => this.carregando.set(false),
    });
  }

  remover(id: string) {
    if (!confirm('Remover médico?')) return;
    this.svc.remover(id).subscribe(() => {
      this.medicos.update(list => list.filter(m => m.id !== id));
      this.toast.success('Médico removido.');
    });
  }
}
