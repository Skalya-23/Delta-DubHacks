import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="This page doesn't exist"
      action={
        <Button variant="primary" asChild>
          <Link to="/">Back to your projects</Link>
        </Button>
      }
    >
      The link might be old, or you might not have access to it.
    </EmptyState>
  )
}
