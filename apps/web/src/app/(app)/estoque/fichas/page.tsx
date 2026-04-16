import { listRecipes } from './actions'
import { FichasView } from './fichas-view'

export const dynamic = 'force-dynamic'

export default async function FichasPage() {
  const { products, metadata, ingredients, recipeIngredients } = await listRecipes()

  return (
    <FichasView
      products={products as Parameters<typeof FichasView>[0]['products']}
      metadata={metadata as Parameters<typeof FichasView>[0]['metadata']}
      ingredients={ingredients as Parameters<typeof FichasView>[0]['ingredients']}
      recipeIngredients={recipeIngredients as Parameters<typeof FichasView>[0]['recipeIngredients']}
    />
  )
}
