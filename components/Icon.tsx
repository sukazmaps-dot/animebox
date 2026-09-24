'use client';

import type { Icon as PhosphorIcon, IconProps } from '@phosphor-icons/react';
import {
  BellIcon, CalendarBlankIcon, CaretRightIcon, ChatCircleIcon,
  ClockIcon, CrownIcon, EnvelopeIcon, HeartIcon, HouseIcon,
  GearSixIcon, InfoIcon, ListIcon, MagnifyingGlassIcon, PaperPlaneTiltIcon,
  PlayIcon, PlusIcon, SparkleIcon, StarIcon, TelevisionIcon,
  TrophyIcon, UserIcon, UsersIcon,
} from '@phosphor-icons/react';

type IconName =
  | 'home' | 'anime' | 'calendar' | 'tracker' | 'heart' | 'bell'
  | 'telegram' | 'info' | 'search' | 'chevron' | 'play' | 'plus'
  | 'star' | 'menu' | 'settings' | 'user' | 'clock' | 'spark' | 'trophy'
  | 'mail' | 'users' | 'chat' | 'crown';

type Props = IconProps & { name: IconName };

const icons: Record<IconName, PhosphorIcon> = {
  home: HouseIcon,
  anime: TelevisionIcon,
  calendar: CalendarBlankIcon,
  tracker: ClockIcon,
  heart: HeartIcon,
  bell: BellIcon,
  telegram: PaperPlaneTiltIcon,
  info: InfoIcon,
  search: MagnifyingGlassIcon,
  chevron: CaretRightIcon,
  play: PlayIcon,
  plus: PlusIcon,
  star: StarIcon,
  menu: ListIcon,
  settings: GearSixIcon,
  user: UserIcon,
  clock: ClockIcon,
  spark: SparkleIcon,
  trophy: TrophyIcon,
  mail: EnvelopeIcon,
  users: UsersIcon,
  chat: ChatCircleIcon,
  crown: CrownIcon,
};

export default function Icon({ name, size = 20, weight = 'regular', ...props }: Props) {
  const Glyph = icons[name];
  return <Glyph size={size} weight={weight} aria-hidden="true" {...props} />;
}
