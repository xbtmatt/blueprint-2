import {
  Account,
  AccountAddress,
  Aptos,
  AptosConfig,
  Bool,
  MoveString,
  Network,
  TypeTagBool,
  TypeTagU64,
  U64,
  parseTypeTag,
} from "@aptos-labs/ts-sdk";
import { AptosTokenObjects } from "../generated/index.js";
import { fundAccounts } from "../src/index.js";
import { AptosToken } from "generated/aptos_token_objects/index.js";

export type CurrentTokenData = {
  collection_id: string;
  description: string;
  is_fungible_v2?: boolean | null;
  largest_property_version_v1?: any | null;
  last_transaction_timestamp: any;
  last_transaction_version: any;
  maximum?: any | null;
  supply: any;
  token_data_id: string;
  token_name: string;
  token_properties: any;
  token_standard: string;
  token_uri: string;
  current_collection?: {
    collection_id: string;
    collection_name: string;
    creator_address: string;
    current_supply: any;
    description: string;
    last_transaction_timestamp: any;
    last_transaction_version: any;
    max_supply?: any | null;
    mutable_description?: boolean | null;
    mutable_uri?: boolean | null;
    table_handle_v1?: string | null;
    token_standard: string;
    total_minted_v2?: any | null;
    uri: string;
  } | null;
} | null;

export type PropertyMapValues = {
  age: number;
  gender: string;
  height: number;
  level: number;
  alive: boolean;
};

describe("aptos token tests", () => {
  const aptos = new Aptos(new AptosConfig({ network: Network.LOCAL }));
  const creator = Account.generate();
  const collectionName = "My favorite collection!";
  const collectionDescription = "The best collection ever!";
  const collectionUri = "https://www.my-collection-uri.com";
  const maxSupply = 100;
  const royaltyNumerator = 5;
  const royaltyDenominator = 100;

  const tokenName = "My favorite token!";
  const tokenDescription = "The best token ever!";
  const tokenUri = "https://www.my-token-uri.com";

  const tokens = new Array<AccountAddress>();
  const tokenData: Record<`0x${string}`, CurrentTokenData> = {};
  let collectionObjectAddress: AccountAddress | undefined;

  const propertyMapKeys = ["age", "gender", "height", "level", "alive"];
  const propertyMapTypes = ["u64", "0x1::string::String", "u64", "u64", "bool"];
  const propertyMapValues: PropertyMapValues = {
    age: 31,
    gender: "male",
    height: 73,
    level: 9001,
    alive: true,
  };

  const APTOS_TOKEN_TYPETAG = parseTypeTag("0x4::aptos_token::AptosToken");

  beforeAll(async () => {
    await fundAccounts(aptos, [creator]);

    await AptosTokenObjects.AptosToken.CreateCollection.submit(
      aptos.config,
      creator,
      collectionDescription,
      maxSupply,
      collectionName,
      collectionUri,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      royaltyNumerator,
      royaltyDenominator,
    );

    const propertyMapBCSValues = [
      new U64(propertyMapValues.age),
      new MoveString(propertyMapValues.gender),
      new U64(propertyMapValues.height),
      new U64(propertyMapValues.level),
      new Bool(propertyMapValues.alive),
    ];

    await AptosTokenObjects.AptosToken.Mint.submit(
      aptos.config,
      creator,
      collectionName,
      tokenDescription,
      tokenName,
      tokenUri,
      propertyMapKeys,
      propertyMapTypes,
      propertyMapBCSValues.map((value) => value.bcsToBytes()),
    );

    const ownedTokens = await aptos.getAccountOwnedTokens({
      accountAddress: creator.accountAddress.toString(),
    });

    const tokensInCollection = ownedTokens.filter(
      (token) => token.current_token_data?.current_collection?.collection_name === collectionName,
    );
    tokensInCollection.forEach((token) => {
      const tokenAddress = AccountAddress.fromRelaxed(token.token_data_id);
      tokens.push(tokenAddress);
      tokenData[tokenAddress.toString()] = token.current_token_data!;
    });

    expect(tokensInCollection.length).toBe(1);
    collectionObjectAddress = AccountAddress.fromRelaxed(
      tokensInCollection[0].current_token_data!.current_collection!.collection_id!,
    );

    const tokenAddressKey = tokens[0].toString();
    const newTokenData = tokenData[tokenAddressKey];
    const tokenInTokenData = tokenAddressKey in tokenData && newTokenData !== null && newTokenData !== undefined;
    expect(tokenInTokenData).toBe(true);
    if (tokenInTokenData) {
      expect(newTokenData.token_name).toBe(tokenName);
      expect(newTokenData.token_uri).toBe(tokenUri);
      expect(newTokenData.collection_id).toBe(collectionObjectAddress!.toString());
      const propertyValues: PropertyMapValues = {
        age: Number(newTokenData.token_properties.age),
        gender: String(newTokenData.token_properties.gender),
        height: Number(newTokenData.token_properties.height),
        level: Number(newTokenData.token_properties.level),
        alive: Boolean(newTokenData.token_properties.alive),
      };

      Object.keys(propertyValues).forEach((key) => {
        expect(propertyValues[key as keyof typeof propertyMapValues]).toBe(
          propertyMapValues[key as keyof typeof propertyMapValues],
        );
      });
    }
  });

  it("checks if beforeAll successfully created a collection and a token", () => {
    expect(collectionObjectAddress).toBeDefined();
    expect(tokens.length).toBeGreaterThan(0);
  });

  it("updates the token's property map values", async () => {
    await AptosTokenObjects.AptosToken.UpdateProperty.submit(
      aptos.config,
      creator,
      tokens[0],
      "age",
      "u64",
      new U64(32).bcsToBytes(),
      [parseTypeTag("0x4::aptos_token_objects::AptosToken")],
    );

    await AptosTokenObjects.AptosToken.UpdateTypedProperty.submit(
      aptos.config,
      creator,
      tokens[0],
      "alive",
      new Bool(false),
      [APTOS_TOKEN_TYPETAG, "bool"],
    );
  });

  //   it("updates the token's property map values", async () => {
  //     await AptosTokenObjects.AptosToken.UpdateProperty.submit(
  //         aptos.config,
  //         creator,
  //         tokens[0],

  //     )
  //   });
});
