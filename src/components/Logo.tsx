import React from 'react';
import { useColorMode, Image } from '@chakra-ui/react';

import logoBlack from 'assets/deip_logo_black.png';
import logoWhite from 'assets/deip_logo_white.png';

export function Logo() {
  const { colorMode } = useColorMode();
  return (
    <Image src={colorMode === 'light' ? logoBlack : logoWhite} alt="DEIP Logo" />
  );
}
