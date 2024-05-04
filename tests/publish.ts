import { Account, Aptos, AptosConfig, Ed25519PrivateKey, Network } from "@aptos-labs/ts-sdk";
import { FUND_AMOUNT } from "../src/utils.js";
import { PUBLISHER_ACCOUNT_PK, publishArgumentTestModule } from "./helper.js";

export async function main() {
  const aptos = new Aptos(new AptosConfig({ network: Network.LOCAL }));
  const publisher = Account.fromPrivateKey({
    privateKey: new Ed25519PrivateKey(PUBLISHER_ACCOUNT_PK),
    legacy: false,
  });
  await aptos.fundAccount({
    accountAddress: publisher.accountAddress,
    amount: FUND_AMOUNT,
  });
  const response = await publishArgumentTestModule(aptos, publisher);
  /* eslint-disable-next-line no-console */
  console.log(response);
}

main().catch((err) => {
  /* eslint-disable-next-line no-console */
  console.error(err);
  process.exit(1);
});
