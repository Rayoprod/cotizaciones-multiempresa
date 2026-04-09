import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SelectorEmpresa } from './selector-empresa';

describe('SelectorEmpresa', () => {
  let component: SelectorEmpresa;
  let fixture: ComponentFixture<SelectorEmpresa>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SelectorEmpresa],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectorEmpresa);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
