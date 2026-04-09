import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CotizadorComponent } from './cotizador';

describe('Cotizador', () => {
  let component: CotizadorComponent;
  let fixture: ComponentFixture<CotizadorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CotizadorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CotizadorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
