import { Module } from "@nestjs/common";
import { OutboxPublisher } from "./outbox.publisher";

/**
 * Wiring mínimo do OutboxPublisher (story 46). Módulo separado do EventsModule
 * para os AGREGADOS emitirem eventos sem importar o barramento inteiro — o
 * EventsModule importa PickingModule (handlers reusam serviços de picking), e o
 * PickingModule precisa publicar `picking.done`; sem este módulo haveria ciclo
 * PickingModule ⇄ EventsModule. O publisher é stateless (recebe a TX por
 * parâmetro), então o wiring é trivial e o EventsModule o re-exporta.
 */
@Module({
  providers: [OutboxPublisher],
  exports: [OutboxPublisher],
})
export class OutboxModule {}
