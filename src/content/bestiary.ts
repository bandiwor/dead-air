import type { StrKey } from '../i18n';
import { Kind } from './enemies';

/** Карточки бестиария: показываются стоп-кадром при первой встрече. Явления — без карточки: их тайна важнее. */
export interface BeastCard {
  name: StrKey;
  desc: StrKey;
  tip: StrKey;
}

export const BESTIARY: Partial<Record<Kind, BeastCard>> = {
  [Kind.Whisperer]: { name: 'beast.whisperer.name', desc: 'beast.whisperer.desc', tip: 'beast.whisperer.tip' },
  [Kind.Mute]: { name: 'beast.mute.name', desc: 'beast.mute.desc', tip: 'beast.mute.tip' },
  [Kind.Echo]: { name: 'beast.echo.name', desc: 'beast.echo.desc', tip: 'beast.echo.tip' },
  [Kind.Unseeing]: { name: 'beast.unseeing.name', desc: 'beast.unseeing.desc', tip: 'beast.unseeing.tip' },
};
