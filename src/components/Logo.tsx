import React from 'react';
import { useColorMode, Image } from '@chakra-ui/react';

import logoBlack from 'assets/octopus_logo_black.png';
import logoWhite from 'assets/octopus_logo_white.png';

export function Logo() {
  const { colorMode } = useColorMode();
  return (
    <Image src={colorMode === 'light' ? logoBlack : logoWhite} alt="Octopus Logo" />
  );
}
