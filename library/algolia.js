import algoliasearch from 'algoliasearch'
import * as dotenv from 'dotenv'
dotenv.config()

const appId = process.env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID
const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX
const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY

export const algoliaSearchClient = algoliasearch(appId, searchApiKey)
const alogoliaSearchIndex = algoliaSearchClient.initIndex(indexName)

export default alogoliaSearchIndex