import * as React from "react";
import styled from "styled-components";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import { convertUtf8ToHex } from "@walletconnect/utils";
import { IInternalEvent } from "@walletconnect/types";
import Button from "./components/Button";
import Column from "./components/Column";
import Wrapper from "./components/Wrapper";
import Modal from "./components/Modal";
import Header from "./components/Header";
import Loader from "./components/Loader";
import { fonts } from "./styles";
import { apiGetAccountAssets, apiGetGasPrices, apiGetAccountNonce } from "./helpers/api";
import {
  sanitizeHex,
  verifySignature,
  hashTypedDataMessage,
  hashMessage,
} from "./helpers/utilities";
import { convertAmountToRawNumber, convertStringToHex } from "./helpers/bignumber";
import { IAssetData } from "./helpers/types";
import Banner from "./components/Banner";
import AccountAssets from "./components/AccountAssets";
import { eip712 } from "./helpers/eip712";

const SLayout = styled.div`
  position: relative;
  width: 100%;
  /* height: 100%; */
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper as any)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SLanding = styled(Column as any)`
  height: 600px;
`;

const SButtonContainer = styled(Column as any)`
  width: 250px;
  margin: 50px 0;
`;

const SConnectButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  margin: 12px 0;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SModalContainer = styled.div`
  width: 100%;
  position: relative;
  word-wrap: break-word;
`;

const SModalTitle = styled.div`
  margin: 1em 0;
  font-size: 20px;
  font-weight: 700;
`;

const SModalParagraph = styled.p`
  margin-top: 30px;
`;

// @ts-ignore
const SBalances = styled(SLanding as any)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

const STable = styled(SContainer as any)`
  flex-direction: column;
  text-align: left;
`;

const SRow = styled.div`
  width: 100%;
  display: flex;
  margin: 6px 0;
`;

const SKey = styled.div`
  width: 30%;
  font-weight: 700;
`;

const SValue = styled.div`
  width: 70%;
  font-family: monospace;
`;

const STestButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
`;

const STestButton = styled(Button as any)`
  border-radius: 8px;
  font-size: ${fonts.size.medium};
  height: 44px;
  width: 100%;
  max-width: 175px;
  margin: 12px;
`;

interface IAppState {
  connector: WalletConnect | null;
  fetching: boolean;
  connected: boolean;
  chainId: number;
  showModal: boolean;
  pendingRequest: boolean;
  uri: string;
  accounts: string[];
  address: string;
  result: any | null;
  assets: IAssetData[];
}

const INITIAL_STATE: IAppState = {
  connector: null,
  fetching: false,
  connected: false,
  chainId: 4, // was 1 for mainet change to 4 for rinkeby
  showModal: false,
  pendingRequest: false,
  uri: "",
  accounts: [],
  address: "",
  result: null,
  assets: [],
};

function timeout(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class App extends React.Component<any, any> {
  public state: IAppState = {
    ...INITIAL_STATE,
  };

  public connect = async () => {
    console.log('\n\n App.tsx ********* connect() function ran..... *********')
    // bridge url
    const bridge = "https://bridge.walletconnect.org";

    // create new connector
    console.log('App.tsx - connector state at beginning: ', this.state.connector)
    const connector = new WalletConnect({ bridge, qrcodeModal: QRCodeModal });
    console.log('App.tsx - QRCodeModal: ', QRCodeModal)


    await this.setState({ connector });
    console.log('App.tsx - created a connector and updated this.state.connector: ', this.state.connector)
    console.log('App.tsx - is the connector connected? : ', connector.connected)
    console.log('++++++++++++++++++++ TIMEOUT BEFORE CREATING SESSION+++++++++++++++++++')
    await timeout(3000);

    // check if already connected
    if (!connector.connected) {
      console.log('App.tsx - connector not connected so creating a new session...')
      // create new session
      await connector.createSession();
      console.log('++++++++++++++++++++ SESSION DONE CREATING +++++++++++++++++++')
      // await timeout(3000);
    }

    // subscribe to events
    console.log('App.tsx - subscribing to events')
    console.log(' App.tsx - connector after creating a new session: ', connector.connected)
    await this.subscribeToEvents();
  };
  public subscribeToEvents = () => {
    console.log('App.tsx ******* subscribeToEvents() called *********')
    const { connector } = this.state;

    if (!connector) {
      return;
    }

    connector.on("session_update", async (error, payload) => {
      console.log(`App.tsx onnector.on("session_update")`);
      console.log('App.tsx - payload: ', payload)

      if (error) {
        throw error;
      }

      const { chainId, accounts } = payload.params[0];
      this.onSessionUpdate(accounts, chainId);
    });

    connector.on("connect", (error, payload) => {
      console.log(`App.tsx - connector.on("connect") & payload: `, payload);

      if (error) {
        throw error;
      }

      this.onConnect(payload);
    });

    connector.on("disconnect", (error, payload) => {
      console.log(`App.tsx - connector.on("disconnect")`);

      if (error) {
        throw error;
      }

      this.onDisconnect();
    });

    if (connector.connected) {
      console.log('App.tsx - connector.connected')
      const { chainId, accounts } = connector;
      const address = accounts[0];
      this.setState({
        connected: true,
        chainId,
        accounts,
        address,
      });
      this.onSessionUpdate(accounts, chainId);
    }

    this.setState({ connector });
    console.log('App.tsx - end of subscribeToEvents()')
    console.log('App.tsx - state at end of subscribeToEvents(): ', this.state)
  };

  public killSession = async () => {
    const { connector } = this.state;
    if (connector) {
      connector.killSession();
    }
    this.resetApp();
  };

  public resetApp = async () => {
    await this.setState({ ...INITIAL_STATE });
  };

  public onConnect = async (payload: IInternalEvent) => {
    console.log('\n\n App.tsx ********* onConnect in App.tsx ran..... *********')
    const { chainId, accounts } = payload.params[0];
    const address = accounts[0];
    await this.setState({
      connected: true,
      chainId,
      accounts,
      address,
    });
    console.log('App.tsx - onConnect() state here: ', this.state)
    this.getAccountAssets();
  };

  public onDisconnect = async () => {
    this.resetApp();
  };

  public onSessionUpdate = async (accounts: string[], chainId: number) => {
    console.log('\n\n ********* onSessionUpdate in App.tsx ran..... *********')
    const address = accounts[0];
    await this.setState({ chainId, accounts, address });
    await this.getAccountAssets();
  };

  public getAccountAssets = async () => {
    console.log('\n\n ********* getAccountsAssets in App.tsx ran..... *********')
    const { address, chainId } = this.state;
    this.setState({ fetching: true });
    try {
      // get account balances
      const assets = await apiGetAccountAssets(address, chainId);
      console.log('App.tsx - getAccountAssets() assets: ', assets)

      await this.setState({ fetching: false, address, assets });
    } catch (error) {
      console.error(error);
      await this.setState({ fetching: false });
    }
  };

  public toggleModal = () => this.setState({ showModal: !this.state.showModal });

  public testSendTransaction = async () => {
    console.log('\n\n ********* testSendTransaction in App.tsx ran..... *********')
    // const { connector, address, chainId } = this.state;
    const { connector, address } = this.state;
    console.log('hardcoded chainId === 4 (rinkeby)')
    const chainId = 4;

    if (!connector) {
      return;
    }

    // from
    const from = address;

    // to
    const to = address;

    // nonce
    // @ts-ignore
    const _nonce = await apiGetAccountNonce(address, chainId); // have to update this code
    console.log('_nonce: ', _nonce, typeof _nonce)
    // console.log('=== have to hardcode and increment the nonce manully ==')
    // _nonce = '189789'
    // console.log('_nonce updated: ', _nonce, typeof _nonce)
    // const nonce = sanitizeHex(convertStringToHex(_nonce));
    const nonce = "0x99"
    console.log('nonce: ', nonce, typeof nonce);

    // gasPrice
    const gasPrices = await apiGetGasPrices();
    const _gasPrice = gasPrices.fast.price;
    const gasPrice = sanitizeHex(convertStringToHex(convertAmountToRawNumber(_gasPrice, 9)));

    // gasLimit
    const _gasLimit = 21000;
    const gasLimit = sanitizeHex(convertStringToHex(_gasLimit));

    // value
    const _value = 0 // 10000000000000; // wei
    const value = sanitizeHex(convertStringToHex(_value));

    // data
    const data = "0x0";

    // test transaction
    const tx = {
      from,
      to,
      nonce,
      gasPrice,
      gasLimit,
      value,
      data,
    };

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send transaction
      const result = await connector.sendTransaction(tx);
      console.log('result: ', result)

      // format displayed result
      const formattedResult = {
        method: "eth_sendTransaction",
        txHash: result,
        from: address,
        to: address,
        value: `${_value} ETH`,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };


  // public testSignMessage = async () => {
  //   console.log('\n\n ********* testSignMessage in App.tsx ran..... *********')
  //   // const { connector, address, chainId } = this.state;
  //   const { connector, address } = this.state;
  //   console.log('hardcoded chainId === 4 (rinkeby)')
  //   const chainId = 4;
  //   console.log('exampleDapp Ap.tsx testSignMessage() - connector: ', connector);
  //   console.log('exampleDapp Ap.tsx testSignMessage() - address: ', address);
  //   console.log('exampleDapp Ap.tsx testSignMessage() - chainId: ', chainId)

    
  public testSignTransaction = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    // from
    const from = address;

    // to
    const to = address;

    // nonce
    const _nonce = await apiGetAccountNonce(address, chainId);
    const nonce = sanitizeHex(convertStringToHex(_nonce));

    // gasPrice
    const gasPrices = await apiGetGasPrices();
    const _gasPrice = gasPrices.slow.price;
    const gasPrice = sanitizeHex(convertStringToHex(convertAmountToRawNumber(_gasPrice, 9)));

    // gasLimit
    const _gasLimit = 21000;
    const gasLimit = sanitizeHex(convertStringToHex(_gasLimit));

    // value
    const _value = 0;
    const value = sanitizeHex(convertStringToHex(_value));

    // data
    const data = "0x";

    // test transaction
    const tx = {
      from,
      to,
      nonce,
      gasPrice,
      gasLimit,
      value,
      data,
    };

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send transaction
      const result = await connector.signTransaction(tx);

      // format displayed result
      const formattedResult = {
        method: "eth_signTransaction",
        from: address,
        to: address,
        value: `${_value} ETH`,
        result,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public testLegacySignMessage = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // hash message
    const hash = hashMessage(message);

    // eth_sign params
    const msgParams = [address, hash];

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send message
      const result = await connector.signMessage(msgParams);

      // verify signature
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_sign (legacy)",
        address,
        valid,
        result,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public testStandardSignMessage = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // encode message (hex)
    const hexMsg = convertUtf8ToHex(message);

    // eth_sign params
    const msgParams = [address, hexMsg];

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send message
      console.log('msgParams: ', msgParams);
      const result = await connector.signMessage(msgParams);

      // verify signature
      const hash = hashMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_sign (standard)",
        address,
        valid,
        result,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public testPersonalSignMessage = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    // test message
    const message = `My email is john@doe.com - ${new Date().toUTCString()}`;

    // encode message (hex)
    const hexMsg = convertUtf8ToHex(message);

    // eth_sign params
    const msgParams = [hexMsg, address];

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // send message
      const result = await connector.signPersonalMessage(msgParams);

      // verify signature
      const hash = hashMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "personal_sign",
        address,
        valid,
        result,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public testSignTypedData = async () => {
    const { connector, address, chainId } = this.state;

    if (!connector) {
      return;
    }

    const message = JSON.stringify(eip712.example);

    // eth_signTypedData params
    const msgParams = [address, message];

    try {
      // open modal
      this.toggleModal();

      // toggle pending request indicator
      this.setState({ pendingRequest: true });

      // sign typed data
      const result = await connector.signTypedData(msgParams);

      // verify signature
      const hash = hashTypedDataMessage(message);
      const valid = await verifySignature(address, result, hash, chainId);

      // format displayed result
      const formattedResult = {
        method: "eth_signTypedData",
        address,
        valid,
        result,
      };

      // display result
      this.setState({
        connector,
        pendingRequest: false,
        result: formattedResult || null,
      });
    } catch (error) {
      console.error(error);
      this.setState({ connector, pendingRequest: false, result: null });
    }
  };

  public render = () => {
    const {
      assets,
      address,
      connected,
      chainId,
      fetching,
      showModal,
      pendingRequest,
      result,
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.killSession}
          />
          <SContent>
            {!address && !assets.length ? (
              <SLanding center>
                <h3>
                  {`Try out WalletConnect`}
                  <br />
                  <span>{`v${process.env.REACT_APP_VERSION}`}</span>
                </h3>
                <SButtonContainer>
                  <SConnectButton left onClick={this.connect} fetching={fetching}>
                    {"Connect to WalletConnect"}
                  </SConnectButton>
                </SButtonContainer>
              </SLanding>
            ) : (
              <SBalances>
                <Banner />
                <h3>Actions</h3>
                <Column center>
                  <STestButtonContainer>
                    <STestButton left onClick={this.testSendTransaction}>
                      {"eth_sendTransaction"}
                    </STestButton>
                    <STestButton left onClick={this.testSignTransaction}>
                      {"eth_signTransaction"}
                    </STestButton>
                    <STestButton left onClick={this.testSignTypedData}>
                      {"eth_signTypedData"}
                    </STestButton>
                    <STestButton left onClick={this.testLegacySignMessage}>
                      {"eth_sign (legacy)"}
                    </STestButton>
                    <STestButton left onClick={this.testStandardSignMessage}>
                      {"eth_sign (standard)"}
                    </STestButton>
                    <STestButton left onClick={this.testPersonalSignMessage}>
                      {"personal_sign"}
                    </STestButton>
                  </STestButtonContainer>
                </Column>
                <h3>Balances</h3>
                {!fetching ? (
                  <AccountAssets chainId={chainId} assets={assets} />
                ) : (
                  <Column center>
                    <SContainer>
                      <Loader />
                    </SContainer>
                  </Column>
                )}
              </SBalances>
            )}
          </SContent>
        </Column>
        <Modal show={showModal} toggleModal={this.toggleModal}>
          {pendingRequest ? (
            <SModalContainer>
              <SModalTitle>{"Pending Call Request"}</SModalTitle>
              <SContainer>
                <Loader />
                <SModalParagraph>{"Approve or reject request using your wallet"}</SModalParagraph>
              </SContainer>
            </SModalContainer>
          ) : result ? (
            <SModalContainer>
              <SModalTitle>{"Call Request Approved"}</SModalTitle>
              <STable>
                {Object.keys(result).map(key => (
                  <SRow key={key}>
                    <SKey>{key}</SKey>
                    <SValue>{result[key].toString()}</SValue>
                  </SRow>
                ))}
              </STable>
            </SModalContainer>
          ) : (
            <SModalContainer>
              <SModalTitle>{"Call Request Rejected"}</SModalTitle>
            </SModalContainer>
          )}
        </Modal>
      </SLayout>
    );
  };
}

export default App;
