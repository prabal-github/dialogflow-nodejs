import { GraphQLClient } from 'graphql-request'
import * as dotenv from 'dotenv'
dotenv.config()

const storeDomain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN
const storefrontAccessToken =
    process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN
const apiVersion = process.env.NEXT_PUBLIC_SHOPIFY_API_VERSION

const url = `https://${storeDomain}/api/${apiVersion}/graphql.json`

/* creating Shopify Client */
const shopifyClient = new GraphQLClient(url, {
    headers: {
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
    },
})

/* fetcher function for SWR Hooks */
export const swrShopifyFetcher = ({
    query,
    variables,
}) => shopifyClient.request(query, variables)

export default shopifyClient