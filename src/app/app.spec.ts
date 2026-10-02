import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

/**
 * Testes do shell da aplicação.
 *
 * `provideRouter` é obrigatório: o shell usa routerLink e routerLinkActive, e
 * sem um Router no injetor a criação do componente falha antes de renderizar
 * qualquer coisa.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('cria o shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renderiza a marca do sistema', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('PEP');
    expect(texto).toContain('Prontuário Eletrônico');
  });

  it('expõe a navegação das telas do experimento', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const destinos = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a[href]'),
    ).map(a => a.getAttribute('href'));

    // /resultados e /laboratorio sao as telas que sustentam o capitulo de
    // resultados do trabalho; perder o link para elas passaria silencioso.
    expect(destinos).toContain('/resultados');
    expect(destinos).toContain('/laboratorio');
  });
});
