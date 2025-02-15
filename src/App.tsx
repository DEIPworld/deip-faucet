import React, { useState, useRef } from 'react';
import {
  ChakraProvider,
  Box,
  Flex,
  Input,
  HStack,
  Text,
  Heading,
  Center,
  theme,
  Button,
  Container,
  Icon,
  List,
  Tag,
  Link,
  useToast,
  Divider,
  ListItem,
  useClipboard,
  IconButton,
  Skeleton,
  Stack,
  AlertDialog,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogFooter
} from '@chakra-ui/react';

import { CopyIcon } from '@chakra-ui/icons';
import { ColorModeSwitcher } from './ColorModeSwitcher';
import { IoLogoTwitter } from 'react-icons/io';

import { Logo } from 'components/Logo';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect } from 'react';

import axios from 'axios';

dayjs.extend(relativeTime);

function Main() {
  const toast = useToast();
  const [listItems, setListItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmiting, setIsSubmiting] = useState(false);
  const [url, setUrl] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const cancelRef = useRef();

  const getListItems = async () => {
    setIsLoading(true);
    axios
      .get('/.netlify/functions/records')
      .then(res => res.data)
      .then(({ data }) => {
        setIsLoading(false);
        if (data && data.length) {
          setListItems(data);
        }
      });
  }

  useEffect(() => {
    getListItems();
  }, []);

  const onRequest = async () => {
    
    const match = /status\/(\d+)/ig.exec(url);
    if (!match) {
      return toast({
        position: 'top-right',
        title: 'Error',
        description: 'Twitter url invalid',
        status: 'error'
      });
    }
    setIsSubmiting(true);
    await axios
      .post('/.netlify/functions/request', { url })
      .then(res => res.data)
      .then(data => {
        if (data.success) {
          getListItems();
          toast({
            position: 'top-right',
            title: 'Tips',
            description: 'Request DEIP success',
            status: 'success'
          });
          setDialogOpen(true);
        } else {
          toast({
            position: 'top-right',
            title: 'Error',
            description: data.message,
            status: 'error'
          });
        }
      })
      .catch((err) => {
        if (err.message === "Request failed with status code 502") {
          // https://docs.netlify.com/functions/overview/#default-deployment-options
          toast({
            position: 'top-right',
            title: 'Request processing time increased the response timeout limit',
            description: 'Request has been sent, but its processing time increased timeout limit. Please check your wallet for DEIP tokens, and retry if you have not received them.',
            status: 'warning'
          });
        } else {
          toast({
            position: 'top-right',
            title: 'Error',
            description: 'Request error, please retry!',
            status: 'error'
          });
        }
      });
    setIsSubmiting(false);
  }

  const onDialogClose = () => {
    setDialogOpen(false);
  }

  return (
    <>
    <Container maxW="container.md" mb="24">
      <Center>
        <Heading>DEIP Authenticated Faucet</Heading>
      </Center>
      <HStack spacing={15} mt="12">
        <Input size="lg" onChange={e => setUrl(e.target.value)}
          placeholder="Please paste the twitter link which contains your Near account" />
        <Button size="lg" colorScheme="teal" onClick={onRequest}
          disabled={isSubmiting || !url}
          isLoading={isSubmiting}>Give me DEIP</Button>
      </HStack>

      <List mt={4} spacing={2} h="120px">
        {
          isLoading ?
          <Stack>
            <Skeleton height="20px" />
          </Stack> :
          listItems.map(({ account, time, link }, idx) => (
            <>
              <ListItem key={`list-item-${idx}`} 
                opacity={Math.floor(100-(idx)*30)/100}
              >
                <Flex justify="space-between">
                  <HStack>
                    
                    <IconButton as={Link} href={link} icon={<Icon as={IoLogoTwitter} />}
                      target="_blank" aria-label="Link" size="xs" />
                    <Heading fontSize="sm">{ account } funded</Heading>
                  </HStack>
                  <Tag>{ dayjs(time*1000).fromNow() }</Tag>
                </Flex>
              </ListItem>
              { idx < listItems.length - 1 && <Divider variant="dashed" /> }
            </>
          ))
        }
      </List>
    </Container>
    <AlertDialog
      isOpen={dialogOpen}
      leastDestructiveRef={cancelRef}
      onClose={() => setDialogOpen(false)}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Tips
          </AlertDialogHeader>
          <AlertDialogBody>
            Funded success! Check your wallet?
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onDialogClose}>
              Cancel
            </Button>
            <Button colorScheme="teal" onClick={() => {
              window.location.href = 'https://wallet.testnet.near.org'
            }} ml={3}>
              Ok
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
    </>
  );
}

export function App() {
  
  const { hasCopied, onCopy } = useClipboard(`Apply for DEIP tokens: [replace with your NEAR testnet account]. DEIP is the first Web 3.0 domain-specific protocol for tokenization and governance of high-value intangible assets: @DEIP_World`);

  return (
    <ChakraProvider theme={theme}>
      <Flex justifyContent="space-between" flexDirection="column" h="100vh">
        <Container maxW="container.lg">
          <Flex justify="space-between" alignItems="center">
            <Box w="120px" h="62px">
              <Logo />
            </Box>
            <ColorModeSwitcher justifySelf="flex-end" />
          </Flex>
        </Container>
        <Main />
        <Container pb="12" maxW="container.lg">
          <Center>
            <Text fontSize="xl">How to fund</Text>
          </Center>
          <Text mt="4" color="gray" fontSize="sm">
            This faucet is running on the DEIP testnet. 
            To prevent malicious actors from exhausting all funds, requests are 
            tied to Twitter social network accounts. 
            Anyone having a Twitter account may request funds within the permitted limits.
          </Text>
          <HStack mt={4} spacing="4">
            <Icon as={IoLogoTwitter} w="8" h="8" />
            <Text color="gray" fontSize="sm">
              To request funds via Twitter, make a tweet with your Near account 
              pasted into the contents. 
              <Button onClick={onCopy} ml={2} size="xs" colorScheme="teal" variant="outline">
                {
                  hasCopied ? 'Copied!' : 
                  <>
                    <CopyIcon mr="1" /> Copy sample
                  </>
                }
              </Button>
              <br/>
              Copy-paste the tweets URL into the above input box and get your DEIP. Each account can get 10 DEIP every 24 hours.
            </Text>
          </HStack>
        </Container>
      </Flex>
    </ChakraProvider>
  );
}
